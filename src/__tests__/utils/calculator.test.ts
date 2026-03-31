import { evaluate, add, subtract, multiply, divide } from '../../utils/calculator';

describe('calculator', () => {
  describe('evaluate', () => {
    it('should evaluate simple addition', () => {
      expect(evaluate('2 + 3')).toEqual({ success: true, value: 5 });
    });

    it('should evaluate simple subtraction', () => {
      expect(evaluate('10 - 4')).toEqual({ success: true, value: 6 });
    });

    it('should evaluate multiplication', () => {
      expect(evaluate('3 * 4')).toEqual({ success: true, value: 12 });
    });

    it('should evaluate division', () => {
      expect(evaluate('20 / 4')).toEqual({ success: true, value: 5 });
    });

    it('should respect operator precedence', () => {
      expect(evaluate('2 + 3 * 4')).toEqual({ success: true, value: 14 });
      expect(evaluate('(2 + 3) * 4')).toEqual({ success: true, value: 20 });
    });

    it('should handle negative numbers', () => {
      expect(evaluate('-5 + 3')).toEqual({ success: true, value: -2 });
    });

    it('should reject invalid characters', () => {
      expect(evaluate('2 + abc')).toEqual({ success: false, error: '表达式包含无效字符' });
    });

    it('should handle division by zero', () => {
      expect(evaluate('1 / 0')).toEqual({ success: false, error: '无效的计算结果' });
    });
  });

  describe('basic operations', () => {
    it('add', () => expect(add(2, 3)).toBe(5));
    it('subtract', () => expect(subtract(10, 4)).toBe(6));
    it('multiply', () => expect(multiply(3, 4)).toBe(12));
    it('divide', () => {
      expect(divide(20, 4)).toBe(5);
      expect(divide(1, 0)).toBeNull();
    });
  });
});