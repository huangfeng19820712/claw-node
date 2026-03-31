/**
 * 简单计算器工具
 * 支持基本数学运算和表达式求值
 */

export interface CalculatorResult {
  success: boolean;
  value?: number;
  error?: string;
}

/**
 * 安全地执行数学表达式求值
 * @param expression 要计算的表达式，如 "2 + 3 * 4"
 */
export function evaluate(expression: string): CalculatorResult {
  try {
    // 移除所有空白字符
    const sanitized = expression.replace(/\s+/g, '');

    // 验证表达式只包含允许的字符
    if (!/^[\d+\-*/().]+$/.test(sanitized)) {
      return { success: false, error: '表达式包含无效字符' };
    }

    // 使用 Function 构造函数进行求值（比 eval 更安全一些）
    const result = new Function(`return (${sanitized})`)();

    if (typeof result !== 'number' || !isFinite(result)) {
      return { success: false, error: '无效的计算结果' };
    }

    return { success: true, value: result };
  } catch {
    return { success: false, error: '表达式语法错误' };
  }
}

/**
 * 基本运算函数
 */
export const add = (a: number, b: number): number => a + b;
export const subtract = (a: number, b: number): number => a - b;
export const multiply = (a: number, b: number): number => a * b;
export const divide = (a: number, b: number): number | null => b !== 0 ? a / b : null;