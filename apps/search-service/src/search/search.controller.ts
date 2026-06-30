import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/search/:businessLine')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // GET: 传统分页 (page/size)，向后兼容
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

  // POST: 深分页 (searchAfter)，前端传 cursor
  @Post('products')
  searchProductsDeep(
    @Param('businessLine') businessLine: string,
    @Body() body: {
      keyword?: string;
      category?: string;
      brand?: string;
      size?: number;
      searchAfter?: any[];
    },
  ) {
    return this.searchService.searchProducts(businessLine, {
      keyword: body.keyword,
      category: body.category,
      brand: body.brand,
      size: body.size || 20,
      searchAfter: body.searchAfter,
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
