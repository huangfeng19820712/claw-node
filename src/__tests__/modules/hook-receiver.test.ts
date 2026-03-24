/**
 * HookReceiver 单元测试
 */

import { HookReceiver } from '../../modules/hook-receiver'
import { CallbackClient } from '../../modules/callback-client'

jest.mock('../../modules/callback-client')

describe('HookReceiver', () => {
  let hookReceiver: HookReceiver
  let mockCallbackClient: jest.Mocked<CallbackClient>

  beforeEach(() => {
    mockCallbackClient = {
      sendHook: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<CallbackClient>

    hookReceiver = new HookReceiver(3001, mockCallbackClient)
  })

  describe('triggerTaskHook', () => {
    it('当 hooks 未定义时不应该出错', async () => {
      await expect(
        hookReceiver.triggerTaskHook(undefined, 'onStart', {})
      ).resolves.not.toThrow()
    })

    it('当 hook URL 不存在时不应该出错', async () => {
      const hooks = {
        onComplete: undefined
      }

      await expect(
        hookReceiver.triggerTaskHook(hooks, 'onComplete', {})
      ).resolves.not.toThrow()
    })

    it('当 hook URL 存在时应该调用 sendHook', async () => {
      const hooks = {
        onStart: 'http://example.com/hook'
      }

      await hookReceiver.triggerTaskHook(hooks, 'onStart', { taskId: '123' })

      expect(mockCallbackClient.sendHook).toHaveBeenCalledWith(
        'http://example.com/hook',
        { taskId: '123' }
      )
    })
  })
})
