import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';

@Controller('api/search/:businessLine')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  // GET: 传统分页（page/size），向后兼容
  @Get('products')
  searchProducts(
    @Param('businessLine') businessLine: string,
    @Query('keyword') keyword?: string,
    @Query('category') category?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brand') brand?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
    @Query('page') page: string = '1',
    @Query('size') size: string = '20',
  ) {
    return this.searchService.searchProducts(businessLine, {
      keyword,
      category,
      categoryId: categoryId ? parseInt(categoryId, 10) : undefined,
      brand,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
      page: parseInt(page, 10),
      size: parseInt(size, 10),
    });
  }

  // POST: 深分页（searchAfter），前端传 cursor
  @Post('products')
  searchProductsDeep(
    @Param('businessLine') businessLine: string,
    @Body() body: {
      keyword?: string;
      category?: string;
      categoryId?: number;
      brand?: string;
      minPrice?: number;
      maxPrice?: number;
      size?: number;
      searchAfter?: any[];
    },
  ) {
    return this.searchService.searchProducts(businessLine, {
      keyword: body.keyword,
      category: body.category,
      categoryId: body.categoryId,
      brand: body.brand,
      minPrice: body.minPrice,
      maxPrice: body.maxPrice,
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
