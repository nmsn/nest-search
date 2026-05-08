import { Controller, Get, Post, Patch, Body, Param, ParseIntPipe } from '@nestjs/common';
import { FormService } from './form.service';
import { CreateFormDto, UpdateFormStatusDto } from './dto/create-form.dto';

@Controller('api/form/:businessLine/forms')
export class FormController {
  constructor(private readonly formService: FormService) {}

  @Post()
  create(
    @Param('businessLine') businessLine: string,
    @Body() dto: CreateFormDto,
  ) {
    return this.formService.create(businessLine, dto);
  }

  @Get()
  findAll(@Param('businessLine') businessLine: string) {
    return this.formService.findAll(businessLine);
  }

  @Get(':id')
  findOne(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.formService.findOne(businessLine, id);
  }

  @Patch(':id')
  updateStatus(
    @Param('businessLine') businessLine: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateFormStatusDto,
  ) {
    return this.formService.updateStatus(businessLine, id, dto);
  }
}
