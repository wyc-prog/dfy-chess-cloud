# 云端联机部署

这个目录把游戏变成“任何网络都能联机”的云端版本：

- 一个进程同时提供静态游戏和联机房间 API；
- 房间数据在内存，免费实例重启/休眠后房间会丢失；
- 不需要玩家开公网端口，也不需要同一 Wi-Fi；
- 玩家打开同一个 HTTPS 网址即可。

## 本机测试

```powershell
$env:APP_ROOT = "D:\与大肥鱼一起下象棋"
$env:PORT = "8780"
python cloud/cloud_server.py
```

打开 `http://127.0.0.1:8780/war.html`，房主创建房间，另一个窗口用邀请链接加入。

## Koyeb 免费部署（Render 打不开时用这个）

Koyeb 可以只用 GitHub 登录，Docker 部署，不需要自己开服务器。

1. 把项目推到 GitHub。仓库至少包含：
   `index.html`、`war.html`、`css/`、`js/`、`assets/`、`screenshots/`、`cloud/`、`Dockerfile`、`.dockerignore`。
2. 打开 <https://app.koyeb.com>，用 GitHub 登录。
3. **Create Service** → **GitHub** → 选择仓库。
4. 配置：
   - Builder：**Dockerfile**
   - Dockerfile path：`Dockerfile`
   - Port：`8080`
   - Instance：Free / 最低配
   - Region：优先 Singapore，其次 Frankfurt / Washington
5. 环境变量：
   ```text
   PUBLIC_URL=https://你的服务名.koyeb.app
   ```
   如果还不知道域名，可以先部署一次，拿到 Koyeb 域名后再补这个变量并重新部署。
6. 部署完成后打开：
   ```text
   https://你的服务名.koyeb.app/war.html
   ```
7. 房主创建房间，点「复制跨电脑邀请链接」，把链接发给对方；对方任何网络下直接打开即可。

> 免费实例可能休眠，休眠后内存房间会清空，重新创建房间即可。要长期稳定需要付费常驻实例或 VPS。

## Render 备用

如果 Render 能打开，也可以用仓库里的 `render.yaml`，Runtime 选 Docker，环境变量同样设置 `PUBLIC_URL`。

## 说明

- 免费实例休眠后，房间会丢，重新创建即可；
- 单实例内存房间，不能横向扩容；
- `PUBLIC_URL` 不填时会用请求的 Host 自动拼，但反向代理下建议显式设置。
