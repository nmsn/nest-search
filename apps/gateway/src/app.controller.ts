import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Req,
  Res,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { Request, Response } from "express";
import { ProxyService } from "./proxy/proxy.service";
import { AdminGuard } from "./guards/cas.guard";
import { Public } from "./common/decorators";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { LoginDto } from "./common/dto/login.dto";
import { RegisterDto } from "./common/dto/register.dto";
import { Roles } from "./common/decorators/roles.decorator";

@ApiTags("Gateway · 代理")
@Controller()
export class AppController {
  constructor(private readonly proxyService: ProxyService) {}

  // ============= Auth 代理 =============

  @ApiOperation({ summary: "用户注册(代理到 auth-service)" })
  @ApiResponse({ status: 201, description: "注册成功" })
  @ApiResponse({ status: 400, description: "参数校验失败" })
  @Post("api/auth/register")
  async register(@Body() body: RegisterDto) {
    return this.proxyService.forward(
      "auth",
      "POST",
      "/api/auth/register",
      body,
    );
  }

  @ApiOperation({ summary: "用户登录(代理到 auth-service)" })
  @ApiResponse({ status: 200, description: "登录成功,返回 token" })
  @ApiResponse({ status: 401, description: "凭证错" })
  @Throttle({ default: { limit: 5, ttl: 60_000 } }) // ← 新加:1 分钟最多 5 次
  @Post("api/auth/login")
  async login(@Body() body: LoginDto) {
    return this.proxyService.forward("auth", "POST", "/api/auth/login", body);
  }

  @ApiOperation({ summary: "校验 token(代理到 auth-service)" })
  @ApiResponse({ status: 200, description: "token 有效" })
  @ApiResponse({ status: 401, description: "token 无效或过期" })
  @Post("api/auth/validate")
  async validate(@Body() body: any) {
    return this.proxyService.forward(
      "auth",
      "POST",
      "/api/auth/validate",
      body,
    );
  }

  @ApiOperation({ summary: "登出(代理到 auth-service)" })
  @ApiResponse({ status: 200, description: "登出成功" })
  @ApiResponse({ status: 401, description: "未登录" })
  @Post("api/auth/logout")
  async logout() {
    return this.proxyService.forward("auth", "POST", "/api/auth/logout");
  }

  @ApiOperation({
    summary: "获取当前用户信息(代理到 auth-service,需要 Bearer token)",
  })
  @ApiResponse({ status: 200, description: "返回当前用户" })
  @ApiResponse({ status: 401, description: "未提供或无效 token" })
  @Get("api/auth/me")
  async me(@Req() req: Request) {
    return this.proxyService.forward("auth", "GET", "/api/auth/me", undefined, {
      authorization: req.headers.authorization || "",
    });
  }

  // ============= Sync 代理(管理员) =============

  @ApiOperation({ summary: "触发全量同步(管理员)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "同步任务已启动" })
  @ApiResponse({ status: 403, description: "非管理员" })
  @Roles("admin", "editor")
  @UseGuards(AdminGuard)
  @Post("api/sync/full/:businessLine")
  async syncFull(@Param("businessLine") bl: string) {
    return this.proxyService.forward("sync", "POST", `/api/sync/full/${bl}`);
  }

  @ApiOperation({ summary: "触发增量同步(管理员)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "同步任务已启动" })
  @ApiResponse({ status: 403, description: "非管理员" })
  @Roles("admin", "editor")  
  @UseGuards(AdminGuard)
  @Post("api/sync/incremental/:businessLine")
  async syncIncremental(@Param("businessLine") bl: string) {
    return this.proxyService.forward(
      "sync",
      "POST",
      `/api/sync/incremental/${bl}`,
    );
  }

  @ApiOperation({ summary: "查询同步记录" })
  @ApiResponse({ status: 200, description: "返回记录列表" })
  @Get("api/sync/records")
  async syncRecords() {
    return this.proxyService.forward("sync", "GET", "/api/sync/records");
  }

  // ============= Search 代理 =============

  @ApiOperation({ summary: "商品搜索" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "返回商品列表" })
  @Get("api/search/:businessLine/products")
  async searchProducts(
    @Param("businessLine") bl: string,
    @Query() query: Record<string, string>,
  ) {
    const qs = new URLSearchParams(query).toString();
    return this.proxyService.forward(
      "search",
      "GET",
      `/api/search/${bl}/products?${qs}`,
    );
  }

  @ApiOperation({ summary: "商品详情" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "商品 ID" })
  @ApiResponse({ status: 200, description: "返回商品详情" })
  @ApiResponse({ status: 404, description: "商品不存在" })
  @Get("api/search/:businessLine/products/:id")
  async getProduct(@Param("businessLine") bl: string, @Param("id") id: string) {
    return this.proxyService.forward(
      "search",
      "GET",
      `/api/search/${bl}/products/${id}`,
    );
  }

  @ApiOperation({ summary: "搜索聚合结果" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "返回聚合结果" })
  @Get("api/search/:businessLine/aggregations")
  async getAggregations(@Param("businessLine") bl: string) {
    return this.proxyService.forward(
      "search",
      "GET",
      `/api/search/${bl}/aggregations`,
    );
  }

  // ============= Form Schemes 代理 =============

  @ApiOperation({ summary: "创建 scheme(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 201, description: "scheme 创建成功" })
  @ApiResponse({ status: 400, description: "参数校验失败" })
  @Post("api/form/:businessLine/schemes")
  async createScheme(@Param("businessLine") bl: string, @Body() body: any) {
    return this.proxyService.forward(
      "form",
      "POST",
      `/api/form/${bl}/schemes`,
      body,
    );
  }

  @ApiOperation({ summary: "scheme 列表(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "返回 scheme 列表" })
  @Get("api/form/:businessLine/schemes")
  async listSchemes(@Param("businessLine") bl: string) {
    return this.proxyService.forward("form", "GET", `/api/form/${bl}/schemes`);
  }

  @ApiOperation({ summary: "scheme 详情(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "scheme ID" })
  @ApiResponse({ status: 200, description: "返回 scheme 详情" })
  @ApiResponse({ status: 404, description: "scheme 不存在" })
  @Get("api/form/:businessLine/schemes/:id")
  async getScheme(@Param("businessLine") bl: string, @Param("id") id: string) {
    return this.proxyService.forward(
      "form",
      "GET",
      `/api/form/${bl}/schemes/${id}`,
    );
  }

  @ApiOperation({ summary: "更新 scheme(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "scheme ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  @ApiResponse({ status: 404, description: "scheme 不存在" })
  @Patch("api/form/:businessLine/schemes/:id")
  async updateScheme(
    @Param("businessLine") bl: string,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward(
      "form",
      "PATCH",
      `/api/form/${bl}/schemes/${id}`,
      body,
    );
  }

  @ApiOperation({ summary: "删除 scheme(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "scheme ID" })
  @ApiResponse({ status: 200, description: "删除成功" })
  @ApiResponse({ status: 404, description: "scheme 不存在" })
  @Delete("api/form/:businessLine/schemes/:id")
  async deleteScheme(
    @Param("businessLine") bl: string,
    @Param("id") id: string,
  ) {
    return this.proxyService.forward(
      "form",
      "DELETE",
      `/api/form/${bl}/schemes/${id}`,
    );
  }

  // ============= Form Forms 代理 =============

  @ApiOperation({ summary: "创建 form(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 201, description: "form 创建成功" })
  @ApiResponse({ status: 400, description: "参数校验失败" })
  @Post("api/form/:businessLine/forms")
  async createForm(@Param("businessLine") bl: string, @Body() body: any) {
    return this.proxyService.forward(
      "form",
      "POST",
      `/api/form/${bl}/forms`,
      body,
    );
  }

  @ApiOperation({ summary: "form 列表(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiResponse({ status: 200, description: "返回 form 列表" })
  @Get("api/form/:businessLine/forms")
  async listForms(@Param("businessLine") bl: string) {
    return this.proxyService.forward("form", "GET", `/api/form/${bl}/forms`);
  }

  @ApiOperation({ summary: "form 详情(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "form ID" })
  @ApiResponse({ status: 200, description: "返回 form 详情" })
  @ApiResponse({ status: 404, description: "form 不存在" })
  @Get("api/form/:businessLine/forms/:id")
  async getForm(@Param("businessLine") bl: string, @Param("id") id: string) {
    return this.proxyService.forward(
      "form",
      "GET",
      `/api/form/${bl}/forms/${id}`,
    );
  }

  @ApiOperation({ summary: "更新 form(代理到 form-service)" })
  @ApiParam({ name: "businessLine", example: "ds" })
  @ApiParam({ name: "id", description: "form ID" })
  @ApiResponse({ status: 200, description: "更新成功" })
  @ApiResponse({ status: 404, description: "form 不存在" })
  @Patch("api/form/:businessLine/forms/:id")
  async updateForm(
    @Param("businessLine") bl: string,
    @Param("id") id: string,
    @Body() body: any,
  ) {
    return this.proxyService.forward(
      "form",
      "PATCH",
      `/api/form/${bl}/forms/${id}`,
      body,
    );
  }
}
