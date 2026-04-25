import { ref, computed, watch } from 'vue'
import { useHermesConfigStore } from '@/stores/hermes/config'
import { validateField, validateConfig } from '@/utils/configValidation'
import type {
  HermesConfig,
  HermesConfigUpdateParams,
  ConfigFieldSchema,
  HermesConfigSchema,
} from '@/api/hermes/types'

export interface FieldError {
  key: string
  message: string
}

export interface UseConfigEditorOptions {
  autoSave?: boolean
  validateOnChange?: boolean
}

export function useConfigEditor(options: UseConfigEditorOptions = {}) {
  const { validateOnChange = true } = options

  const configStore = useHermesConfigStore()

  // ---- 状态 ----

  const configValues = ref<HermesConfig>({})
  const originalValues = ref<HermesConfig>({})
  const fieldErrors = ref<Map<string, string>>(new Map())
  const isInitialized = ref(false)

  // ---- Computed ----

  /**
   * 已修改的字段集合
   */
  const modifiedFields = computed(() => {
    const modified = new Set<string>()
    for (const key of Object.keys(configValues.value)) {
      if (isFieldDifferent(key)) {
        modified.add(key)
      }
    }
    return modified
  })

  /**
   * 是否有未保存的修改
   */
  const hasChanges = computed(() => modifiedFields.value.size > 0)

  /**
   * 是否有验证错误
   */
  const hasErrors = computed(() => fieldErrors.value.size > 0)

  /**
   * 所有错误列表
   */
  const errors = computed<FieldError[]>(() => {
    const result: FieldError[] = []
    fieldErrors.value.forEach((message, key) => {
      result.push({ key, message })
    })
    return result
  })

  /**
   * 获取已修改的增量数据
   */
  const changes = computed<HermesConfigUpdateParams>(() => {
    const result: HermesConfigUpdateParams = {}
    modifiedFields.value.forEach(key => {
      const value = configValues.value[key]
      if (value !== undefined) {
        result[key] = value
      }
    })
    return result
  })

  // ---- 方法 ----

  /**
   * 检查字段值是否与原始值不同
   */
  function isFieldDifferent(key: string): boolean {
    const current = configValues.value[key]
    const original = originalValues.value[key]
    return JSON.stringify(current) !== JSON.stringify(original)
  }

  /**
   * 初始化编辑器
   */
  function initialize(config: HermesConfig) {
    originalValues.value = JSON.parse(JSON.stringify(config))
    configValues.value = JSON.parse(JSON.stringify(config))
    fieldErrors.value.clear()
    isInitialized.value = true
  }

  /**
   * 从 store 加载配置
   */
  async function loadFromStore() {
    if (!configStore.config) {
      await configStore.fetchConfig()
    }
    if (configStore.config) {
      initialize(configStore.config)
    }
  }

  /**
   * 更新单个字段
   */
  function updateField(key: string, value: unknown) {
    configValues.value[key] = value

    if (validateOnChange) {
      validateFieldByKey(key)
    }

    if (isFieldDifferent(key)) {
      configStore.markFieldModified(key)
    } else {
      configStore.unmarkFieldModified(key)
    }
  }

  /**
   * 批量更新字段
   */
  function updateFields(updates: Partial<HermesConfig>) {
    for (const [key, value] of Object.entries(updates)) {
      configValues.value[key] = value
      if (validateOnChange) {
        validateFieldByKey(key)
      }
      if (isFieldDifferent(key)) {
        configStore.markFieldModified(key)
      } else {
        configStore.unmarkFieldModified(key)
      }
    }
  }

  /**
   * 重置单个字段
   */
  function resetField(key: string) {
    configValues.value[key] = JSON.parse(JSON.stringify(originalValues.value[key]))
    fieldErrors.value.delete(key)
    configStore.unmarkFieldModified(key)
  }

  /**
   * 重置所有修改
   */
  function resetAll() {
    configValues.value = JSON.parse(JSON.stringify(originalValues.value))
    fieldErrors.value.clear()
    configStore.resetModified()
  }

  /**
   * 验证单个字段
   */
  function validateFieldByKey(key: string): boolean {
    const schema = getFieldSchema(key)
    const value = configValues.value[key]

    const result = validateField(schema, value)

    if (!result.valid) {
      fieldErrors.value.set(key, result.error ?? '验证失败')
      return false
    } else {
      fieldErrors.value.delete(key)
      return true
    }
  }

  /**
   * 验证所有修改的字段
   */
  function validate(): boolean {
    const schema = configStore.configSchema
    if (!schema) {
      return true
    }

    const result = validateConfig(configValues.value, schema)

    if (!result.valid) {
      result.errors.forEach(err => {
        fieldErrors.value.set(err.key, err.message)
      })
      return false
    }

    fieldErrors.value.clear()
    return true
  }

  /**
   * 获取字段 Schema
   */
  function getFieldSchema(key: string): ConfigFieldSchema | undefined {
    const schema = configStore.configSchema
    if (!schema?.categories) return undefined

    for (const category of schema.categories) {
      const field = (category.fields || []).find(f => f.key === key)
      if (field) return field
    }
    return undefined
  }

  /**
   * 获取字段错误信息
   */
  function getFieldError(key: string): string | undefined {
    return fieldErrors.value.get(key)
  }

  /**
   * 清除字段错误
   */
  function clearFieldError(key: string) {
    fieldErrors.value.delete(key)
  }

  /**
   * 清除所有错误
   */
  function clearAllErrors() {
    fieldErrors.value.clear()
  }

  /**
   * 获取所有修改的增量
   */
  function getChanges(): HermesConfigUpdateParams {
    return changes.value
  }

  /**
   * 保存修改
   */
  async function save(): Promise<boolean> {
    if (!hasChanges.value) {
      return true
    }

    if (!validate()) {
      return false
    }

    try {
      await configStore.updateConfig(getChanges())
      originalValues.value = JSON.parse(JSON.stringify(configValues.value))
      configStore.resetModified()
      return true
    } catch (error) {
      console.error('[useConfigEditor] save failed:', error)
      throw error
    }
  }

  /**
   * 检查字段是否已修改
   */
  function isModified(key: string): boolean {
    return modifiedFields.value.has(key)
  }

  /**
   * 获取字段值
   */
  function getFieldValue<T = unknown>(key: string, defaultValue?: T): T {
    const value = configValues.value[key]
    return (value as T) ?? (defaultValue as T)
  }

  /**
   * 获取原始字段值
   */
  function getOriginalValue<T = unknown>(key: string, defaultValue?: T): T {
    const value = originalValues.value[key]
    return (value as T) ?? (defaultValue as T)
  }

  // 监听 store 配置变化，自动同步
  watch(
    () => configStore.config,
    newConfig => {
      if (newConfig && !hasChanges.value) {
        initialize(newConfig)
      }
    },
    { immediate: true }
  )

  return {
    // 状态
    configValues,
    originalValues,
    fieldErrors,
    isInitialized,
    // Computed
    modifiedFields,
    hasChanges,
    hasErrors,
    errors,
    changes,
    // 方法
    initialize,
    loadFromStore,
    updateField,
    updateFields,
    resetField,
    resetAll,
    validate,
    validateFieldByKey,
    getFieldSchema,
    getFieldError,
    clearFieldError,
    clearAllErrors,
    getChanges,
    save,
    isModified,
    getFieldValue,
    getOriginalValue,
    isFieldDifferent,
  }
}
