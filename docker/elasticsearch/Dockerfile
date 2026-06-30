# ====== 基础镜像 ======
# 用 8.15.5 (latest 8.x stable)
FROM elasticsearch:8.15.5

# ====== 安装 IK 中文分词插件 ======
# -b: batch mode,跳过 "Continue? [y/N]" 交互式确认
RUN bin/elasticsearch-plugin install -b \
  https://release.infinilabs.com/analysis-ik/stable/elasticsearch-analysis-ik-8.15.5.zip

# ====== 安装 pinyin 拼音插件 ======
RUN bin/elasticsearch-plugin install -b \
  https://release.infinilabs.com/analysis-pinyin/stable/elasticsearch-analysis-pinyin-8.15.5.zip

# ====== 拷贝 IK 词典和配置到插件目录 ======
# IK 8.x 插件不包含词典,必须手动提供 config
# 从 https://github.com/infinilabs/analysis-ik/tree/master/config 下载
# 拷贝到 ES 容器内的 /usr/share/elasticsearch/config/analysis-ik/
COPY config/analysis-ik/ /usr/share/elasticsearch/config/analysis-ik/

# ====== 清理 ======
RUN yum clean all || true
