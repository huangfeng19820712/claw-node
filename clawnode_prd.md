# ClawNode PRD（产品需求文档）

## 一、产品概述

ClawNode 是 OpenClaw 的执行节点代理，负责接收任务、调用 Claude Code
执行，并将结果回传。

## 二、核心目标

-   实现远程节点执行 Claude Code
-   支持任务回调与日志回传
-   支持 Session 持续交互
-   构建可扩展执行网络

## 三、核心功能

1.  任务拉取（Pull 模式）
2.  Claude Code 执行
3.  Session 管理
4.  Hook 回调处理
5.  结果回传
6.  日志流式输出

## 四、系统架构

OpenClaw → ClawNode → Claude Code → 回调 OpenClaw

## 五、功能模块

-   Task Poller
-   Executor
-   Session Manager
-   Hook Receiver
-   Callback Client
-   Log Streamer

## 六、状态机

PENDING → RUNNING → FAILED → RETRY → SUCCESS

## 七、安全设计

-   执行目录隔离
-   超时控制
-   命令白名单

## 八、扩展能力

-   多节点调度
-   并发执行
-   多模型支持

## 九、MVP范围

-   单节点
-   CLI执行
-   Webhook回调
