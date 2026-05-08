import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { SchemeService } from './scheme.service';
import { CreateSchemeDto, UpdateSchemeDto } from './dto/create-scheme.dto';

@Controller('api/form/:businessLine/schemes')
export class SchemeController {
  constructor(private readonly schemeService: SchemeService) {}

  @Post()
  create(
    @Param('businessLine') businessLine: string,
    @Body() dto: CreateSchemeDto,
  ) {
    return this.schemeService.create(businessLine, dto);
  }

  @Get()
  findAll(@Param('businessLine') businessLine: string) {
    return this.schemeService.findAll(businessLine);
  }

  @Get(':id')
  findOne(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.schemeService.findOne(businessLine, id);
  }

  @Patch(':id')
  update(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSchemeDto,
  ) {
    return this.schemeService.update(businessLine, id, dto);
  }

  @Delete(':id')
  remove(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.schemeService.remove(businessLine, id);
  }
}
