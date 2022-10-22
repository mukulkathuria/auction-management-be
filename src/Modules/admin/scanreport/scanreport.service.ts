import { Injectable, Logger } from '@nestjs/common';
import { Response as Res } from 'express';
import { Parser } from 'json2csv';
import * as fs from 'fs';
import { LOCATION } from 'src/constants/location.constants';
import {
  getScanReportBodyDto,
  getScanReportsDto,
  updateMarkDoneBodyDto,
} from 'src/dto/admin.reports.module.dto';
import { PrismaService } from 'src/Services/prisma.service';
import { formatDate } from 'src/utils/formatDate.utils';
import { valdiateScanAuction } from 'src/validations/admin.scan.validations';
import { paginationDto } from 'src/dto/common.dto';
import { paginationHelperForAllData } from '../utils';
import * as AdmZip from 'adm-zip';
import { addDays } from 'src/utils/common.utils';
import { locationScansDto } from 'src/dto/user.scan.module.dto';
import { Products } from '@prisma/client';

@Injectable()
export class ScanReportsService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly logger = new Logger(ScanReportsService.name);

  async getFailedScanByAuction(
    reportinfo: getScanReportBodyDto,
    pagination: paginationDto,
  ) {
    const { error } = valdiateScanAuction(reportinfo);
    if (error) {
      return { error };
    }
    const { location, auction, markdone } = reportinfo;
    const { page, limit, all } = pagination;
    try {
      const scanData = await this.prismaService.failedScans.findMany({
        where: {
          locid: location,
          auctionId: auction,
          markDone: markdone,
        },
      });
      const { data, pageCount } = paginationHelperForAllData(
        scanData,
        page,
        limit,
        all,
      );

      return { data, pageCount };
    } catch (error) {
      this.logger.error(error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }
  async updateMarkDone(markdoneinfo: updateMarkDoneBodyDto) {
    const { id, markdone } = markdoneinfo;
    try {
      const scanData = await this.prismaService.failedScans.update({
        where: {
          id: id,
        },
        data: { markDone: markdone },
      });
      return { success: true };
    } catch (error) {
      this.logger.error(error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }

  async getScrapperScans(reportinfo: getScanReportBodyDto) {
    const { error } = valdiateScanAuction(reportinfo);
    if (error) {
      return { error };
    }
    const { location, auction } = reportinfo;
    try {
      const data = await this.prismaService.scraperZip.findMany({
        where: { auctionId: auction, locid: location },
      });
      return { data };
    } catch (error) {
      this.logger.error(error?.message || error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }

  async exportScrapperScans(scanReport: getScanReportBodyDto) {
    const { auction, location } = scanReport;

    try {
      const scrapperZip = await this.prismaService.scraperZip.findMany({
        where: {
          auctionId: auction,
          locid: location,
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
            lte: addDays(1),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });
      const newUploads = scrapperZip.filter((l) => l.isNewUploaded);
      const lastZip = scrapperZip[scrapperZip.length - 1];

      const duration = {
        gte: newUploads.length
          ? newUploads[newUploads.length - 1].lastcsvgenerated
          : new Date(new Date().setHours(0, 0, 0, 0)),
        lte: new Date(),
      };

      const scannedData = await this.prismaService.scans.findMany({
        where: { createdAt: duration, locid: location, auctionId: auction },
        select: {
          locations: { select: { city: true } },
          tags: { select: { tag: true } },
          products: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!scannedData.length) {
        return { error: { status: 404, messsage: 'No Scanned Item Found!' } };
      }

      const formattedData: locationScansDto[] = [];
      scannedData.forEach((scan) => {
        if (
          scan.locations.city === LOCATION.HOUSTON ||
          scan.locations.city === LOCATION.DALLAS
        ) {
          formattedData.push({
            lotNo: scan.products[0].lotNo,
            Quantity: scan.products[0].quantity,
            Title: `${scan.tags[0].tag} + ${scan.products[0].title}`,
            Description: scan.products[0].description,
            Consignor: scan.products[0].consignor,
            StartBidEach: scan.products[0].startingBid,
          });
        } else {
          formattedData.push({
            lotNo: scan.products[0].lotNo,
            Title: `${scan.tags[0].tag} + ${scan.products[0].title}`,
            Category: scan.products[0].category,
            Featured: 'N',
            QuantityAvailable: scan.products[0].quantity,
            StartingBid: scan.products[0].startingBid,
            NewLot: '',
            Description: scan.products[0].description,
          });
        }
      });

      const existingFileNameArr =
        scrapperZip.length &&
        lastZip.filePath
          .replace(/^.*[\\\/]/, '')
          .split('.')[0]
          .split('_');

      // Creation of CSV
      const zip = new AdmZip();
      const json2csv = new Parser({ fields: Object.keys(formattedData[0]) });
      const CSV_FINAL = json2csv.parse(formattedData);
      const lastNumber =
        existingFileNameArr &&
        parseInt(existingFileNameArr[existingFileNameArr.length - 1]);

      const currFormatDate = `${formatDate(new Date())}_${
        formatDate(new Date(lastZip?.createdAt || undefined)) ===
          formatDate(new Date()) && lastNumber
          ? lastNumber + 1
          : 1
      }`;

      const olddir = __dirname.split('/');
      olddir.splice(olddir.length - 4, 4);
      const dir = `${olddir.join('/')}/src/scrapper`;

      if (!fs.existsSync(`${dir}`)) {
        fs.mkdirSync(`${dir}`);
      }

      if (!fs.existsSync(`${dir}/${currFormatDate}`)) {
        fs.mkdirSync(`${dir}/${currFormatDate}`);
      }

      //Created csv File
      fs.writeFileSync(
        `${dir}/${currFormatDate}/${currFormatDate}.csv`,
        CSV_FINAL,
      );

      const scanProducts = scannedData.map((scan) => {
        return {
          productImg: scan.products[0].images,
          products: scan.products,
        };
      });

      const output = `${dir}/zipFiles/${currFormatDate}.zip`;

      if (!fs.existsSync(`${dir}/zipFiles`)) {
        fs.mkdirSync(`${dir}/zipFiles`);
      }

      if (!fs.existsSync(`${dir}/images`)) {
        fs.mkdirSync(`${dir}/images`);
      }

      const products: Products[] = [];
      scanProducts.forEach((l) => {
        products.push(l.products[0]);
        l.productImg.forEach((image) => {
          const imageSplit = image.split('/');
          const imageFileName = imageSplit[imageSplit.length - 1];
          fs.copyFileSync(image, `${dir}/${currFormatDate}/${imageFileName}`);
        });
      });

      zip.addLocalFolder(`${dir}/${currFormatDate}`);
      zip.writeZip(output);
      // Log Successful Creation of Zip File
      this.logger.log('Create Zip File Success');

      const zipFilePath = fs.realpathSync(
        `${dir}/zipFiles/${currFormatDate}.zip`,
      );

      await this.prismaService.scraperZip.create({
        data: {
          products: {
            connect: products.map((prod) => ({
              productId: prod.productId,
            })),
          },
          filePath: zipFilePath,
          lastcsvgenerated: new Date(),
          auction: {
            connect: {
              id: auction,
            },
          },
          isNewUploaded: false,
          locations: {
            connect: {
              locid: location,
            },
          },
        },
      });
      return {
        data: { status: 200, message: 'Generate Scan Report Success' },
      };
    } catch (error) {
      this.logger.error(error?.message || error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }

  async getZipScanReport(scanReportQuery: getScanReportsDto, res: Res) {
    try {
      const scanReport = await this.prismaService.scraperZip.findFirst({
        where: {
          id: Number(scanReportQuery.scrapperId),
          locid: scanReportQuery.location,
        },
        select: {
          filePath: true,
        },
      });

      if (scanReportQuery.isUploaded === 'true') {
        await this.prismaService.scraperZip.update({
          where: {
            id: Number(scanReportQuery.scrapperId),
          },
          data: {
            isNewUploaded: true,
            lastcsvgenerated: new Date(),
          },
        });
      }

      const zip = new AdmZip(scanReport.filePath);
      const data = zip.toBuffer();
      const splittedFilePath = scanReport.filePath.split('/');
      const fileName = splittedFilePath[splittedFilePath.length - 1].toString();

      res.setHeader('Content-disposition', `attachment; filename=${fileName}`);
      res.set('Content-Type', 'application/octet-stream');
      res.set('Content-length', data.length.toString());
      res.send(data);

      return { data: { status: 200, message: 'Download is Starting' } };
    } catch (error) {
      this.logger.error(error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }
}
