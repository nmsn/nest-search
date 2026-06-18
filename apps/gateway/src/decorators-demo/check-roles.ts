import 'reflect-metadata';
import { AppController } from '../app.controller';

console.log('=== 验证 @Roles metadata 是否真的写到 method 上 ===\n');

// 验证 syncFull 上的 metadata
const syncFullRoles = Reflect.getMetadata('roles', AppController.prototype.syncFull);
console.log('syncFull roles:', syncFullRoles);

const syncFullPath = Reflect.getMetadata('path', AppController.prototype.syncFull);
console.log('syncFull path:', syncFullPath);

const syncFullMethod = Reflect.getMetadata('method', AppController.prototype.syncFull);
console.log('syncFull method:', syncFullMethod);

// 验证 listForms 没有 @Roles,应该是 undefined
const listFormsRoles = Reflect.getMetadata('roles', AppController.prototype.listForms);
console.log('\nlistForms roles (期望 undefined):', listFormsRoles);

// 期望输出:
// syncFull roles: [ 'admin', 'editor' ]
// syncFull path: '/api/sync/full/:businessLine'
// syncFull method: 'POST'
// listForms roles (期望 undefined): undefined
