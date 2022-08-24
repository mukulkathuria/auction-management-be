import { Injectable, Logger } from '@nestjs/common';
import {
  locationBodyDto,
  locationQueryDataDto,
} from 'src/dto/admin.location.module.dto';
import { successErrorDto } from 'src/dto/common.dto';
import { PrismaService } from 'src/Services/prisma.service';
import { validateLocationBody } from 'src/validations/admin.location.validations';

@Injectable()
export class LocationService {
  constructor(private readonly prismaService: PrismaService) {}
  private readonly logger = new Logger(LocationService.name);

  async createLocation(locinfo: locationBodyDto): Promise<successErrorDto> {
    const { data, error } = validateLocationBody(locinfo);
    if (error) {
      return { error };
    }
    try {
      await this.prismaService.location.create({
        data: { city: data.city, address: data.address },
      });
      return {
        success: true,
      };
    } catch (error) {
      this.logger.warn(error);
      return { error: { status: 500, message: 'Server error' } };
    }
  }

  async getLocationDetails(locquery: locationQueryDataDto) {
    const { location } = locquery;
    if (!location) {
      return { error: { status: 422, message: 'Location is required' } };
    }
    try {
      const data = await this.prismaService.location.findUniqueOrThrow({
        where: { locid: location },
        select: {
          city: true,
          address: true,
          Warehouses: true,
          assigneduser: {
            select: { firstname: true, lastname: true, createdAt: true },
          },
        },
      });
      return { data };
    } catch (error) {
      return { error: { status: 422, message: 'Location not found' } };
    }
  }
}
