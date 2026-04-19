"use strict";
/**
 * global-agent v4 不再有 `global-agent/bootstrap` 子路径；用此文件给 NODE_OPTIONS --require。
 * 依赖环境变量 GLOBAL_AGENT_HTTP_PROXY / GLOBAL_AGENT_HTTPS_PROXY（由 verify-method-a.ps1 设置）。
 */
const { bootstrap } = require("global-agent");
bootstrap();
