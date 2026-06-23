// 0022: re-export drizzle-zod 推断的 Zod schema(消除字段重复定义)
// RegisterApiSchema 接受明文 password,service 层 bcrypt 后入库
export {
  RegisterApiSchema as CreateUserDtoSchema,
  InsertUserDbSchema,
} from "../../database/dto/users.dto";
export type {
  RegisterApi as CreateUserDto,
  InsertUserDb,
} from "../../database/dto/users.dto";
