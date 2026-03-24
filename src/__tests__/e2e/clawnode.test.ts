/**
 * E2E 测试 - 端到端测试
 *
 * 测试环境要求:
 * 1. NODE_ENV=test
 * 2.  mock OpenClaw 服务
 * 3.  mock Claude Code
 */

import { ClawNode } from '../../index'
import { config } from '../../config'

describe('E2E 测试', () => {
  // 跳过需要实际环境的测试
  describe.skip('实际环境测试', () => {
    let clawNode: ClawNode

    beforeAll(() => {
      // 使用测试配置
      process.env.OPENCLAW_URL = 'http://localhost:9999'
      process.env.NODE_ID = 'test-node-e2e'
      process.env.NODE_SECRET = 'test-secret'
    })

    beforeEach(() => {
      clawNode = new ClawNode()
    })

    afterAll(async () => {
      if (clawNode) {
        await clawNode.stop()
      }
    })

    it('应该能够启动和停止', async () => {
      await clawNode.start()
      await clawNode.stop()
    })
  })

  describe('配置测试', () => {
    it('应该使用测试环境配置', () => {
      expect(config).toBeDefined()
    })
  })
})
