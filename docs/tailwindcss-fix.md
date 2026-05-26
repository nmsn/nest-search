# Tailwind CSS 样式修复文档

## 问题描述

迁移到 `@tanstack/react-start` 后，部分前端项目的 Tailwind CSS 样式没有生效。

## 问题分析

### 根本原因

TanStack Start 项目中，`__root.tsx` 需要提供完整的 HTML 文档结构，包括：
- `<html>`、`<head>`、`<body>` 标签
- CSS 样式表链接
- `<Scripts />` 组件用于客户端 hydration

如果缺少这些结构，Tailwind CSS 样式将无法正确加载。

### 关键配置对比

参考模板：`template/start-basic`

**正确结构（使用 `shellComponent`）**：

```tsx
export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* 布局组件 */}
        <Scripts />
      </body>
    </html>
  )
}
```

**错误结构（缺少 HTML 文档包装）**：

```tsx
export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  errorComponent: DefaultCatchBoundary,
  notFoundComponent: () => <NotFound />,
  component: RootComponent,  // ❌ 只提供内容组件，缺少 HTML 文档结构
})

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <div className="flex h-screen">  {/* Tailwind 类名不会生效 */}
          {/* ... */}
        </div>
      </AuthProvider>
    </QueryClientProvider>
  )
}
```

## 修复步骤

### 1. 确保 tsconfig.json 配置正确

```json
{
  "compilerOptions": {
    "paths": {
      "~/*": ["./src/*"]
    }
  },
  "include": ["src", "vite.config.ts"]
}
```

### 2. 确保 app.css 使用正确的 Tailwind v4 语法

```css
@import 'tailwindcss' source('../');

@layer base {
  html {
    color-scheme: light dark;
  }
  /* ... */
}
```

### 3. 更新 __root.tsx 使用 shellComponent

提供完整的 HTML 文档结构。

## 验证方法

1. 运行 `vite build` 确保构建成功
2. 检查 `.output/public/assets/app-*.css` 文件存在且包含 Tailwind 类
3. 启动开发服务器，检查浏览器 Network 面板中 CSS 文件是否被加载
4. 检查 HTML 源码中是否有正确的 `<link rel="stylesheet">` 标签

## 相关文件

- `src/routes/__root.tsx` - 根路由组件
- `src/styles/app.css` - Tailwind CSS 入口文件
- `vite.config.ts` - Vite 配置
- `tsconfig.json` - TypeScript 配置