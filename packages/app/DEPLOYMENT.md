# 客户端部署配置

这份文档说明如何配置和构建 Zentic 的移动端和 Web 端。

## 一、Expo 项目配置

### 1.1 更新项目信息

在 `app.config.js` 中：

```javascript
owner: "YOUR_EXPO_USERNAME",  // 替换成你的 Expo 用户名
eas: {
  projectId: "5af4cfb0-402a-4366-aa78-458f8ede1cca",  // 已更新
}
```

**如何获取你的 Expo 用户名**：

- 访问 https://expo.dev/accounts/[username]/settings
- 或运行 `eas whoami`

### 1.2 EAS CLI 登录

```bash
npm install -g eas-cli
eas login
eas whoami  # 确认登录成功
```

## 二、iOS (TestFlight)

### 2.1 前置条件

- Apple Developer 账号（$99/年）
- 在 Apple Developer 注册 Bundle Identifier
- Xcode 和命令行工具（macOS）

### 2.2 Bundle Identifier

**当前配置**：`sh.zentic`

如果上游已经注册了这个 ID，你需要换一个：

1. 访问 https://developer.apple.com/account/resources/identifiers/list
2. 创建新的 App ID（例如 `com.yourcompany.zentic`）
3. 在 `app.config.js` 中更新：
   ```javascript
   variants: {
     production: {
       name: "Zentic",
       packageId: "com.yourcompany.zentic",  // 改成你注册的 ID
   ```

### 2.3 构建

```bash
cd packages/app
eas build --platform ios --profile production
```

构建需要 20-40 分钟，完成后 EAS 会给你一个下载链接。

### 2.4 上传到 TestFlight

**方式 1：手动上传**（推荐，不需要改 eas.json）

1. 从 EAS 下载 `.ipa` 文件
2. 打开 https://appstoreconnect.apple.com
3. 创建新应用（如果还没有）
4. 进入应用 → TestFlight
5. 点击"+"号上传构建版本

**方式 2：自动上传**（需要先创建 App Store Connect 应用）

1. 在 App Store Connect 创建应用后，记下 App ID
2. 在 `eas.json` 中更新：
   ```json
   "submit": {
     "production": {
       "ios": {
         "ascAppId": "YOUR_APP_ID"
       }
   ```
3. 运行：
   ```bash
   eas submit --platform ios --profile production
   ```

### 2.5 分发给测试用户

1. 在 TestFlight 页面添加内部测试员（最多 100 人）
2. 或提交 Beta 审核后添加外部测试员（最多 10,000 人）
3. 测试员会收到 TestFlight 邀请邮件

## 三、Android (APK)

### 3.1 构建 APK

```bash
cd packages/app
eas build --platform android --profile production-apk
```

APK 可以直接分发，不需要 Google Play。

### 3.2 安装

下载 APK 后：

- 在手机上启用"允许安装未知来源"
- 传输文件并安装

## 四、Web 端（VPS 部署）

### 4.1 构建

```bash
cd packages/app
npm run build:web
```

输出在 `packages/app/dist/` 目录。

### 4.2 部署到 VPS

**方式 1：rsync**

```bash
rsync -avz --delete packages/app/dist/ user@your-vps:/var/www/app.zentic.sh/
```

**方式 2：手动**

1. 在 VPS 上创建目录：

   ```bash
   mkdir -p /var/www/app.zentic.sh
   ```

2. 本地打包：

   ```bash
   cd packages/app
   tar czf zentic-web.tar.gz dist/
   ```

3. 上传并解压：
   ```bash
   scp zentic-web.tar.gz user@vps:/tmp/
   ssh user@vps "cd /var/www/app.zentic.sh && tar xzf /tmp/zentic-web.tar.gz --strip-components=1"
   ```

### 4.3 Nginx 配置示例

```nginx
server {
    listen 443 ssl http2;
    server_name app.zentic.sh;

    root /var/www/app.zentic.sh;
    index index.html;

    # SSL 证书（已在 zentic-deploy 的 Caddy 中配置，这里略）

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 资源文件缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 禁止缓存 index.html
    location = /index.html {
        add_header Cache-Control "no-cache, must-revalidate";
    }
}
```

### 4.4 Caddy 配置示例

如果用 Caddy（和 zentic-deploy 一致）：

```
app.zentic.sh {
    root * /var/www/app.zentic.sh
    encode gzip
    file_server
    try_files {path} /index.html

    @static {
        path *.js *.css *.png *.jpg *.jpeg *.gif *.ico *.svg *.woff *.woff2 *.ttf *.eot
    }
    header @static Cache-Control "public, max-age=31536000, immutable"

    header /index.html Cache-Control "no-cache, must-revalidate"
}
```

## 五、桌面端 (macOS/Windows/Linux)

### 5.1 签名要求

- **macOS**：需要 Apple Developer ID 证书（和 iOS 同一个账号）
- **Windows**：需要代码签名证书（可选，不签名会有安全警告）
- **Linux**：不需要签名

### 5.2 构建

```bash
cd packages/desktop
npm run build  # 构建当前平台
```

输出在 `packages/desktop/dist/`。

### 5.3 macOS 公证

如果配置了证书，`electron-builder` 会自动公证。在 `electron-builder.yml` 中：

```yaml
mac:
  identity: "Developer ID Application: Your Name (TEAM_ID)"
  notarize: true
```

需要设置环境变量：

```bash
export APPLE_ID="your@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### 5.4 发布

构建产物可以：

- 上传到 GitHub Releases（`electron-builder.yml` 已配置 `provider: github`）
- 通过 HTTP 服务器分发
- 打包到 DMG/EXE/AppImage 直接分发

## 六、故障排查

### 6.1 EAS 构建失败

```bash
eas build:list  # 查看历史构建
eas build:view [BUILD_ID]  # 查看详细日志
```

常见问题：

- **证书过期**：在 Apple Developer 更新，然后 `eas credentials`
- **Bundle ID 冲突**：换一个 ID（见 2.2 节）
- **依赖安装失败**：检查 `package.json` 和网络

### 6.2 Web 端白屏

1. 检查浏览器控制台错误
2. 确认 `dist/` 下有 `index.html`
3. 确认服务器配置了 SPA fallback（`try_files`）
4. 检查 CORS 配置（如果 API 和 Web 在不同域）

### 6.3 iOS 安装后崩溃

1. 在 Xcode 中查看设备日志（Window → Devices and Simulators）
2. 检查 Bundle ID 是否与 Provisioning Profile 匹配
3. 确认 `.secrets/` 下的 plist 文件存在且有效

## 七、持续集成 (可选)

如果想自动构建：

1. 在 GitHub Actions 中配置 EAS secrets
2. 使用 `eas-cli` 的非交互模式：
   ```yaml
   - run: eas build --platform ios --profile production --non-interactive --no-wait
   ```
3. 构建完成后会通过 webhook 通知

详见 EAS 文档：https://docs.expo.dev/build/building-on-ci/

## 八、免费开发者模式（无需 Apple Developer 账号）

如果暂时没有 Apple Developer 账号（$99/年），可以用以下方式在自己的 iPhone 上测试：

### 8.1 本地构建（需要 Mac）

**优点**：完全免费，真机测试
**缺点**：需要 Mac，每 7 天需要重新签名

#### 步骤

1. **安装 Xcode**（从 Mac App Store）

2. **添加 Apple ID**：
   - 打开 Xcode → Settings → Accounts
   - 点击"+"添加你的个人 Apple ID
   - 选择你的账号 → 管理证书 → 点击"+"创建 Apple Development 证书

3. **连接 iPhone**：
   - 用 USB 连接 iPhone 到 Mac
   - iPhone 上信任这台电脑
   - 在 Xcode 中（Window → Devices and Simulators）确认设备已识别

4. **首次构建**：

   ```bash
   cd packages/app
   npm --prefix ../.. run build:client  # 先构建依赖
   npx expo run:ios --device
   ```

5. **信任开发者**：
   - 首次安装后，iPhone 上打开应用会提示"未受信任的开发者"
   - 进入 设置 → 通用 → VPN 与设备管理
   - 点击你的 Apple ID → 信任

6. **后续构建**：
   ```bash
   npx expo run:ios --device  # 代码改动后重新运行
   ```

#### 注意事项

- **签名有效期**：免费证书只有 7 天，过期后需要重新构建安装
- **Bundle ID**：Xcode 会自动在 `sh.zentic` 后面加你的 Team ID，不会和上游冲突
- **设备数量**：最多 3 台设备
- **推送通知**：免费账号支持，但配置更复杂

### 8.2 模拟器构建（需要 Mac）

如果只想在 iOS 模拟器（非真机）测试：

```bash
npx expo run:ios  # 不加 --device 就是模拟器
```

这种方式：

- ✅ 完全免费，无时间限制
- ✅ 不需要 Apple ID
- ❌ 无法测试推送通知、相机等真机功能
- ❌ 性能表现和真机不同

### 8.3 EAS Build 模拟器构建（需要 Mac）

如果想用 EAS 云端构建模拟器版本：

在 `eas.json` 添加：

```json
{
  "build": {
    "simulator": {
      "ios": {
        "simulator": true,
        "image": "macos-tahoe-26.6-xcode-27.1"
      },
      "env": {
        "APP_VARIANT": "development"
      }
    }
  }
}
```

然后：

```bash
eas build --platform ios --profile simulator
```

下载 `.tar.gz` 文件，解压后拖到模拟器安装。

### 8.4 升级到付费账号后

当你购买了 Apple Developer 账号（$99/年），就可以：

1. **使用 TestFlight**：按照第二节的步骤
2. **延长签名时间**：从 7 天变为 1 年
3. **分发给其他人**：通过 TestFlight 或 Ad Hoc
4. **启用高级功能**：App Groups、Apple Pay 等

在 eas.json 中恢复 `submit` 配置，更新 `ascAppId`，就可以用 `eas submit` 自动上传。
