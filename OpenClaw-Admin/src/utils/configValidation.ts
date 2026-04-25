import type {
  HermesConfig,
  HermesConfigSchema,
  ConfigFieldSchema,
  ConfigFieldValidation,
} from '@/api/hermes/types'

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface ConfigValidationResult {
  valid: boolean
  errors: Array<{ key: string; message: string }>
}

/**
 * 验证单个字段
 */
export function validateField(
  field: ConfigFieldSchema | undefined,
  value: unknown
): ValidationResult {
  if (!field) {
    return { valid: true }
  }

  const validation = field.validation
  const isEmpty = value === undefined || value === null || value === ''

  if (validation?.required && isEmpty) {
    return {
      valid: false,
      error: `${field.label || field.key} 是必填字段`,
    }
  }

  if (isEmpty) {
    return { valid: true }
  }

  switch (field.type) {
    case 'number':
      return validateNumberField(field, value)
    case 'text':
    case 'textarea':
      return validateTextField(field, value)
    case 'boolean':
      return validateBooleanField(value)
    case 'select':
      return validateSelectField(field, value)
    default:
      return { valid: true }
  }
}

/**
 * 验证数字类型字段
 */
function validateNumberField(
  field: ConfigFieldSchema,
  value: unknown
): ValidationResult {
  const num = Number(value)

  if (isNaN(num)) {
    return {
      valid: false,
      error: `${field.label || field.key} 必须是有效数字`,
    }
  }

  const validation = field.validation
  if (!validation) {
    return { valid: true }
  }

  if (validation.min !== undefined && num < validation.min) {
    return {
      valid: false,
      error: `${field.label || field.key} 不能小于 ${validation.min}`,
    }
  }

  if (validation.max !== undefined && num > validation.max) {
    return {
      valid: false,
      error: `${field.label || field.key} 不能大于 ${validation.max}`,
    }
  }

  return { valid: true }
}

/**
 * 验证文本类型字段
 */
function validateTextField(
  field: ConfigFieldSchema,
  value: unknown
): ValidationResult {
  const str = String(value)
  const validation = field.validation

  if (!validation) {
    return { valid: true }
  }

  if (validation.min !== undefined && str.length < validation.min) {
    return {
      valid: false,
      error: `${field.label || field.key} 长度不能少于 ${validation.min} 个字符`,
    }
  }

  if (validation.max !== undefined && str.length > validation.max) {
    return {
      valid: false,
      error: `${field.label || field.key} 长度不能超过 ${validation.max} 个字符`,
    }
  }

  if (validation.pattern) {
    try {
      const regex = new RegExp(validation.pattern)
      if (!regex.test(str)) {
        return {
          valid: false,
          error: validation.patternMessage || `${field.label || field.key} 格式不正确`,
        }
      }
    } catch {
      console.warn(`[configValidation] Invalid pattern: ${validation.pattern}`)
    }
  }

  return { valid: true }
}

/**
 * 验证布尔类型字段
 */
function validateBooleanField(value: unknown): ValidationResult {
  if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
    return {
      valid: false,
      error: '必须是布尔值',
    }
  }
  return { valid: true }
}

/**
 * 验证选择类型字段
 */
function validateSelectField(
  field: ConfigFieldSchema,
  value: unknown
): ValidationResult {
  if (!field.options || field.options.length === 0) {
    return { valid: true }
  }

  const isValid = field.options.some(opt => opt.value === value)
  if (!isValid) {
    const validOptions = field.options.map(opt => opt.label).join(', ')
    return {
      valid: false,
      error: `${field.label || field.key} 必须是以下选项之一: ${validOptions}`,
    }
  }

  return { valid: true }
}

/**
 * 验证整个配置
 */
export function validateConfig(
  config: HermesConfig,
  schema: HermesConfigSchema
): ConfigValidationResult {
  const errors: Array<{ key: string; message: string }> = []

  if (!schema?.categories) {
    return { valid: true, errors: [] }
  }

  for (const category of schema.categories) {
    for (const field of category.fields || []) {
      const value = config[field.key]
      const result = validateField(field, value)

      if (!result.valid && result.error) {
        errors.push({
          key: field.key,
          message: result.error,
        })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 验证配置增量
 */
export function validateConfigChanges(
  changes: Partial<HermesConfig>,
  schema: HermesConfigSchema
): ConfigValidationResult {
  const errors: Array<{ key: string; message: string }> = []

  if (!schema?.categories) {
    return { valid: true, errors: [] }
  }

  const fieldMap = new Map<string, ConfigFieldSchema>()
  for (const category of schema.categories) {
    for (const field of category.fields || []) {
      fieldMap.set(field.key, field)
    }
  }

  for (const [key, value] of Object.entries(changes)) {
    const field = fieldMap.get(key)
    if (field) {
      const result = validateField(field, value)
      if (!result.valid && result.error) {
        errors.push({ key, message: result.error })
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * 创建验证规则（用于表单组件）
 */
export function createValidationRules(
  validation: ConfigFieldValidation | undefined,
  label: string
): Array<(value: unknown) => boolean | string> {
  const rules: Array<(value: unknown) => boolean | string> = []

  if (!validation) {
    return rules
  }

  if (validation.required) {
    rules.push((value: unknown) => {
      if (value === undefined || value === null || value === '') {
        return `${label} 是必填字段`
      }
      return true
    })
  }

  if (validation.min !== undefined) {
    rules.push((value: unknown) => {
      if (typeof value === 'number') {
        return value >= validation.min! || `${label} 不能小于 ${validation.min}`
      }
      if (typeof value === 'string') {
        return (
          value.length >= validation.min! ||
          `${label} 长度不能少于 ${validation.min} 个字符`
        )
      }
      return true
    })
  }

  if (validation.max !== undefined) {
    rules.push((value: unknown) => {
      if (typeof value === 'number') {
        return value <= validation.max! || `${label} 不能大于 ${validation.max}`
      }
      if (typeof value === 'string') {
        return (
          value.length <= validation.max! ||
          `${label} 长度不能超过 ${validation.max} 个字符`
        )
      }
      return true
    })
  }

  if (validation.pattern) {
    rules.push((value: unknown) => {
      if (typeof value !== 'string' || value === '') {
        return true
      }
      try {
        const regex = new RegExp(validation.pattern!)
        return (
          regex.test(value) ||
          validation.patternMessage ||
          `${label} 格式不正确`
        )
      } catch {
        return true
      }
    })
  }

  return rules
}
