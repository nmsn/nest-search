import { Controller, Get, Post, Patch, Delete, Req, Res, Param, Body, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy/proxy.service';

@Controller()
export class AppController {
  constructor(private readonly proxyService: ProxyService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'gateway', timestamp: new Date().toISOString() };
  }

  // Sync Service routes
  @Post('api/sync/full/:businessLine')
  async syncFull(@Param('businessLine') bl: string, @Req() req: Request) {
    return this.proxyService.forward('sync', 'POST', `/api/sync/full/${bl}`);
  }

  @Post('api/sync/incremental/:businessLine')
  async syncIncremental(@Param('businessLine') bl: string, @Req() req: Request) {
    return this.proxyService.forward('sync', 'POST', `/api/sync/incremental/${bl}`);
  }

  @Get('api/sync/records')
  async syncRecords() {
    return this.proxyService.forward('sync', 'GET', '/api/sync/records');
  }

  // Search Service routes
  @Get('api/search/:businessLine/products')
  async searchProducts(
    @Param('businessLine') bl: string,
    @Query() query: Record<string, string>,
  ) {
    const qs = new URLSearchParams(query).toString();
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/products?${qs}`);
  }

  @Get('api/search/:businessLine/products/:id')
  async getProduct(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/products/${id}`);
  }

  @Get('api/search/:businessLine/aggregations')
  async getAggregations(@Param('businessLine') bl: string) {
    return this.proxyService.forward('search', 'GET', `/api/search/${bl}/aggregations`);
  }

  // Form Service routes - Schemes
  @Post('api/form/:businessLine/schemes')
  async createScheme(@Param('businessLine') bl: string, @Body() body: any) {
    return this.proxyService.forward('form', 'POST', `/api/form/${bl}/schemes`, body);
  }

  @Get('api/form/:businessLine/schemes')
  async listSchemes(@Param('businessLine') bl: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/schemes`);
  }

  @Get('api/form/:businessLine/schemes/:id')
  async getScheme(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/schemes/${id}`);
  }

  @Patch('api/form/:businessLine/schemes/:id')
  async updateScheme(
    @Param('businessLine') bl: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward('form', 'PATCH', `/api/form/${bl}/schemes/${id}`, body);
  }

  @Delete('api/form/:businessLine/schemes/:id')
  async deleteScheme(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'DELETE', `/api/form/${bl}/schemes/${id}`);
  }

  // Form Service routes - Forms
  @Post('api/form/:businessLine/forms')
  async createForm(@Param('businessLine') bl: string, @Body() body: any) {
    return this.proxyService.forward('form', 'POST', `/api/form/${bl}/forms`, body);
  }

  @Get('api/form/:businessLine/forms')
  async listForms(@Param('businessLine') bl: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/forms`);
  }

  @Get('api/form/:businessLine/forms/:id')
  async getForm(@Param('businessLine') bl: string, @Param('id') id: string) {
    return this.proxyService.forward('form', 'GET', `/api/form/${bl}/forms/${id}`);
  }

  @Patch('api/form/:businessLine/forms/:id')
  async updateForm(
    @Param('businessLine') bl: string,
    @Param('id') id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward('form', 'PATCH', `/api/form/${bl}/forms/${id}`, body);
  }
}
