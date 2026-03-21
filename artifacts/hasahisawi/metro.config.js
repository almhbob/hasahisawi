const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const defaultBlockList = config.resolver?.blockList;
const extraBlocks = [/_tmp_\d+/, /proto-loader_tmp/];

config.resolver = {
  ...config.resolver,
  blockList: Array.isArray(defaultBlockList)
    ? [...defaultBlockList, ...extraBlocks]
    : defaultBlockList
    ? [defaultBlockList, ...extraBlocks]
    : extraBlocks,
};

module.exports = config;
