FROM python:3.12-slim

WORKDIR /app

# 只复制运行游戏需要的文件；模型、宣传视频、安装包不进入镜像
COPY index.html war.html ./
COPY css ./css
COPY js ./js
COPY assets ./assets
COPY screenshots ./screenshots
COPY cloud ./cloud

ENV PORT=8080
EXPOSE 8080

CMD ["python", "cloud/cloud_server.py"]
