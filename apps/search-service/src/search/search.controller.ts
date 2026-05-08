import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/search/:businessLine')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('products')
  searchProducts(
    @Param('businessLine') businessLine: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
  ) {
    return this.searchService.searchProducts(businessLine, {
      keyword,
      category,
      brand,
      page: parseInt(page, 10),
      size: parseInt(size, 10),
    });
  }

  @Get('products/:id')
  getProduct(
    @Param('businessLine') businessLine: string,
    @Param('id') id: string,
  ) {
    return this.searchService.getProduct(businessLine, id);
  }

  @Get('aggregations')
  getAggregations(@Param('businessLine') businessLine: string) {
    return this.searchService.getAggregations(businessLine);
  }
}
