import { AMZENV, SCANENV, WALLENV } from 'src/constants/common.constants';
import {
  scanItemParamsDto,
  scrapperReturnDataDto,
} from 'src/dto/user.scan.module.dto';
import { uuid } from 'src/utils/uuid.utils';

export const getScrapperData = async (
  barcode: string,
  scaninfo: scanItemParamsDto,
): Promise<scrapperReturnDataDto> => {
  const params = {
    barcode: barcode,
    key: process.env[SCANENV],
  };
  const {
    default: { get },
  } = await import('axios');
  try {
    const { data } = await get('https://api.barcodelookup.com/v3/products', {
      params,
    });

    const storedata = data?.products?.length
      ? (data.products[0].stores as [])
      : [];

    console.log('storedata: ', storedata);
    const wallmartProduct = storedata.find((l) => l.name === 'Walmart');
    const AmazonProduct = storedata.find((l) => l.name === 'Amazon.com');
    if (!storedata.length || (!wallmartProduct && !AmazonProduct)) {
      return { error: { status: 422, message: 'No store found' } };
    }
    if (wallmartProduct) {
      const { data: walmartdata } = await get(
        `https://api.bluecartapi.com/request?api_key=${process.env[WALLENV]}&type=product&url=${wallmartProduct.link}`,
      );

      console.log('walmartdata======>>>', walmartdata.product);
      if (walmartdata.request_info.success) {
        const sendedData = {
          productId: uuid(),
          images: walmartdata.product.images,
          description: walmartdata.product.description,
          title: walmartdata.product.title,
          price: walmartdata.product?.buybox_winner?.price,
          manufacturer: 'Walmart',
        };
        return { dataScrapper: sendedData, scanParams: scaninfo };
      }
    } else if (AmazonProduct) {
      const { data: amazondata } = await get(
        `https://api.rainforestapi.com/request?api_key=${process.env[AMZENV]}&type=product&url=${AmazonProduct.link}`,
      );
      if (amazondata.request_info.success) {
        const sendedData = {
          productId: uuid(),
          images: amazondata.product?.images,
          description:
            amazondata.product?.description ||
            amazondata.product?.feature_bullets?.join(' '),
          title: amazondata.product?.title,
          price: amazondata.product?.buybox_winner?.price,
          manufacturer: 'Amazon',
        };
        return { dataScrapper: sendedData, scanParams: scaninfo };
      }
    }
    return { error: { status: 404, message: 'No Products found' } };
  } catch (err) {
    console.log('err?.response?.status>>>>>>>>>>>>', err);
    if (err?.response?.status === 404) {
      return { error: { status: 404, message: 'No product found' } };
    }
    return { error: { status: 500, message: 'Some error occured' } };
  }
};

export const getLotNo = (previousLotNo: string, isNew?: boolean): string => {
  const NumbLot = previousLotNo.match(/\d+/);
  const stringlot = previousLotNo.match(/[D-Z]/);
  const Chars = [
    'D',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
  ];
  const charindexof = Chars.indexOf(stringlot[0]);
  const numb = Number(NumbLot[0]) + 1;
  if (isNew) {
    return 20 + Chars[charindexof + 1];
  }

  return numb + Chars[charindexof];
};
