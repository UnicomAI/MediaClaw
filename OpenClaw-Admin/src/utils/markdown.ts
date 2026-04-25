import MarkdownIt from 'markdown-it'
import katex from 'katex'
import hljs from 'highlight.js'

type SimpleMarkdownRenderOptions = {
  emptyHtml?: string
  autoNestList?: boolean
  imageBasePath?: string
  workspace?: string
  authToken?: string
}

const markdownRenderer = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: true,
})

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function generateCodeBlockWithLineNumbers(originalCode: string, lang: string): string {
  let highlighted = ''
  
  if (lang && hljs.getLanguage(lang)) {
    try {
      highlighted = hljs.highlight(originalCode, { language: lang, ignoreIllegals: true }).value
    } catch (e) {
      highlighted = escapeHtml(originalCode)
    }
  } else {
    highlighted = escapeHtml(originalCode)
  }
  
  // 移除末尾的换行符，避免产生多余的空行号
  const trimmedHighlighted = highlighted.replace(/\n+$/, '')
  const lines = trimmedHighlighted.split('\n')
  
  let lineNumbersHtml = ''
  for (let i = 1; i <= lines.length; i++) {
    lineNumbersHtml += `<span class="line-number">${i}</span>\n`
  }
  
  const escapedOriginalCode = originalCode
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  
  return `<div class="code-block-container">
<div class="code-line-numbers">${lineNumbersHtml}</div>
<div class="code-content"><code class="language-${lang || 'plaintext'}">${trimmedHighlighted}</code></div>
<button class="code-copy-btn" data-code="${escapedOriginalCode}" title="Copy code"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg></button>
</div>`
}

markdownRenderer.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token?.info || ''
  const content = token?.content || ''
  const lang = info.trim().split(/\s+/)[0] || ''
  
  return generateCodeBlockWithLineNumbers(content, lang)
}

markdownRenderer.renderer.rules.code_block = (tokens, idx) => {
  const token = tokens[idx]
  const content = token?.content || ''
  
  return generateCodeBlockWithLineNumbers(content, '')
}

function renderLatex(content: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(content, {
      displayMode: displayMode,
      throwOnError: false,
      output: 'html',
    })
  } catch (e) {
    console.error('KaTeX render error:', e)
    return content
  }
}

function processLatex(content: string): string {
  let result = content
  
  // 处理块级公式 $$...$$ (支持跨多行)
  result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const trimmed = math.trim()
    if (!trimmed) return ''
    return `<div class="katex-display">${renderLatex(trimmed, true)}</div>`
  })
  
  // 处理行内公式 $...$ (不跨行)
  result = result.replace(/\$([^\$\n]+?)\$/g, (_, math) => {
    const trimmed = math.trim()
    if (!trimmed) return ''
    return renderLatex(trimmed, false)
  })
  
  return result
}

let headingCounters: number[] = [0, 0, 0, 0, 0, 0]

function resetHeadingCounters() {
  headingCounters = [0, 0, 0, 0, 0, 0]
}

function getHeadingNumber(level: number): string {
  const idx = level - 1
  if (idx >= 0 && idx < 6) {
    headingCounters[idx] = (headingCounters[idx] ?? 0) + 1
  }
  
  for (let i = level; i < 6; i++) {
    headingCounters[i] = 0
  }
  
  const parts: string[] = []
  for (let i = 0; i < level; i++) {
    const count = headingCounters[i] ?? 0
    if (count > 0) {
      parts.push(String(count))
    }
  }
  
  return parts.join('.')
}

const defaultHeadingOpenRule = markdownRenderer.renderer.rules.heading_open
markdownRenderer.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const nextToken = tokens[idx + 1]
  
  if (token && nextToken && nextToken.type === 'inline') {
    const text = nextToken.content || ''
    const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
    token.attrSet('id', id)
    
    const level = token.tag === 'h1' ? 1 : 
                  token.tag === 'h2' ? 2 : 
                  token.tag === 'h3' ? 3 : 
                  token.tag === 'h4' ? 4 : 
                  token.tag === 'h5' ? 5 : 
                  token.tag === 'h6' ? 6 : 1
    
    const number = getHeadingNumber(level)
    if (number) {
      token.attrSet('data-heading-number', number)
    }
  }
  
  if (defaultHeadingOpenRule) {
    return defaultHeadingOpenRule(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

const defaultLinkOpenRule = markdownRenderer.renderer.rules.link_open
markdownRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const href = token?.attrGet('href') || ''
  if (/^https?:\/\//i.test(href)) {
    token?.attrSet('target', '_blank')
    token?.attrSet('rel', 'noreferrer noopener')
  }

  if (defaultLinkOpenRule) {
    return defaultLinkOpenRule(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

const defaultImageRule = markdownRenderer.renderer.rules.image
markdownRenderer.renderer.rules.image = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const src = token?.attrGet('src') || ''
  
  if (src && !/^https?:\/\//i.test(src) && !/^data:/i.test(src)) {
    const imageBasePath = (env as any)?.imageBasePath as string | undefined
    const workspace = (env as any)?.workspace as string | undefined
    const authToken = (env as any)?.authToken as string | undefined
    
    if (imageBasePath && workspace) {
      const resolvedPath = resolveImagePath(src, imageBasePath)
      let apiSrc = `/api/files/get?path=${encodeURIComponent(resolvedPath)}&workspace=${encodeURIComponent(workspace)}&binary=true`
      if (authToken) {
        apiSrc += `&token=${encodeURIComponent(authToken)}`
      }
      token?.attrSet('src', apiSrc)
    }
  }
  
  if (defaultImageRule) {
    return defaultImageRule(tokens, idx, options, env, self)
  }
  return self.renderToken(tokens, idx, options)
}

function resolveImagePath(src: string, basePath: string): string {
  if (src.startsWith('/')) {
    return src.slice(1)
  }
  
  if (src.startsWith('./')) {
    src = src.slice(2)
  }
  
  const normalizedBase = basePath.replace(/\\/g, '/')
  const lastSlash = normalizedBase.lastIndexOf('/')
  const baseDir = lastSlash >= 0 ? normalizedBase.substring(0, lastSlash) : ''
  
  while (src.startsWith('../')) {
    src = src.slice(3)
    const lastSlash = baseDir.lastIndexOf('/')
    if (lastSlash >= 0) {
      return baseDir.substring(0, lastSlash) + '/' + src
    }
    return src
  }
  
  return baseDir ? `${baseDir}/${src}` : src
}

function normalizeLeadingIndent(line: string): string {
  const match = line.match(/^([\t \u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]*)(.*)$/u)
  if (!match) return line
  const leading = (match[1] || '').replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/gu, ' ')
  const body = (match[2] || '').replace(/^[•·●▪◦‣⁃]\s*/u, '- ')
  return `${leading}${body}`
}

function isFenceDelimiter(line: string): boolean {
  return /^[ \t]{0,3}(```+|~~~+)/.test(line)
}

function splitTableCells(line: string): string[] {
  const trimmedStart = line.trimStart()
  const trimmedEnd = line.trimEnd()
  const raw = line.split('|')
  let start = 0
  let end = raw.length

  if (trimmedStart.startsWith('|')) start += 1
  if (trimmedEnd.endsWith('|')) end -= 1

  return raw.slice(start, end).map((cell) => cell.trim())
}

function parseTableSeparatorLine(line: string): { colCount: number } | null {
  const cells = splitTableCells(line)
  if (cells.length < 2) return null
  for (const cell of cells) {
    if (!/^:?-{3,}:?$/.test(cell)) return null
  }
  return { colCount: cells.length }
}

function normalizeGfmTableBlocks(lines: string[]): string[] {
  let hasSeparator = false
  let inFence = false
  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    if (/\|\s*:?-{3,}:?\s*\|/.test(line)) {
      hasSeparator = true
      break
    }
  }
  if (!hasSeparator) return lines

  const expanded: string[] = []
  inFence = false

  for (const line of lines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      expanded.push(line)
      continue
    }
    if (inFence) {
      expanded.push(line)
      continue
    }

    if (/\|\s*:?-{3,}:?\s*\|/.test(line) && /\|\s+\|/.test(line)) {
      expanded.push(...line.replace(/\|\s+\|/g, '|\n|').split('\n'))
      continue
    }

    expanded.push(line)
  }

  const repaired: string[] = []
  inFence = false
  for (const line of expanded) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      repaired.push(line)
      continue
    }
    if (inFence) {
      repaired.push(line)
      continue
    }

    const separator = parseTableSeparatorLine(line)
    if (separator && repaired.length > 0) {
      const headerLine = repaired[repaired.length - 1] || ''
      const headerCells = splitTableCells(headerLine)

      if (headerCells.length === separator.colCount + 1) {
        const title = headerCells[0]?.trim() || ''
        const cells = headerCells.slice(1)
        repaired.pop()
        if (title) repaired.push(title)
        repaired.push(`| ${cells.join(' | ')} |`)
      }
    }

    repaired.push(line)
  }

  return repaired
}

function normalizeGroupingText(content: string): string {
  return content
    .trim()
    .replace(/[*_`~]/g, '')
}

function looksLikeGroupTitle(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  const hasMarkdownLink = /\[[^\]]+]\(https?:\/\/[^)\s]+\)/.test(text)
  if (/[：:]/.test(text)) return false
  if (/[。！？!?]\s*$/.test(text)) return false
  if (!hasMarkdownLink && /https?:\/\//i.test(text)) return false
  if (/^(支持|新增|增加|修复|修正|优化|调整|移除|删除|合并|拆分|更新|改进|减少|提供|暴露|规范化)/u.test(text)) return false
  if (text.length > 60) return false

  if (hasMarkdownLink) return true
  if (/[\/]/.test(text)) return true
  if (/[()（）]/.test(text)) return true
  if (/(Changes|Fixes)\b/.test(text)) return true
  if (/(支持|增强|能力|改进|修复)\s*$/u.test(text)) return true

  if (text.length <= 20 && /[\p{Script=Han}]/u.test(text)) return true
  if (text.length <= 24 && /^[A-Za-z][A-Za-z0-9 ._-]*$/.test(text)) return true

  return false
}

function looksLikeGroupSubItem(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  if (/^(摘要|要点|点评|锐评|结论|说明|来源|备注|时间|链接)\s*[:：]/.test(text)) return true
  if (/^「[^」]{1,20}」\s*(锐评|点评|评论)\s*[:：]/.test(text)) return true
  return false
}

function looksLikeStrongGroupTitle(content: string): boolean {
  const text = normalizeGroupingText(content)
  if (!text) return false
  const hasMarkdownLink = /\[[^\]]+]\(https?:\/\/[^)\s]+\)/.test(text)
  if (/[：:]/.test(text)) return false
  if (/[。！？!?]\s*$/.test(text)) return false
  if (!hasMarkdownLink && /https?:\/\//i.test(text)) return false
  if (/^(支持|新增|增加|修复|修正|优化|调整|移除|删除|合并|拆分|更新|改进|减少|提供|暴露|规范化)/u.test(text)) return false
  if (text.length > 60) return false
  if (hasMarkdownLink) return true
  if (/[\/]/.test(text)) return true
  if (/[()（）]/.test(text)) return true
  if (/(Changes|Fixes)\b/.test(text)) return true
  if (/(支持|增强|能力|改进|修复)\s*$/u.test(text)) return true
  return false
}

function autoNestListLines(lines: string[]): { lines: string[]; changed: boolean } {
  const next = [...lines]
  let inFence = false
  let changed = false

  type ListItem = {
    index: number
    indent: number
    content: string
    isTitle: boolean
    isStrongTitle: boolean
  }

  const readIndentWidth = (prefix: string) => prefix.replace(/\t/g, '    ').length
  const parseListItem = (line: string): { indent: number; content: string } | null => {
    const unordered = line.match(/^([ \t]*)([-*+])\s+(.+)$/)
    if (unordered) return { indent: readIndentWidth(unordered[1] || ''), content: unordered[3] || '' }
    const ordered = line.match(/^([ \t]*)(\d{1,9}\.)\s+(.+)$/)
    if (ordered) return { indent: readIndentWidth(ordered[1] || ''), content: ordered[3] || '' }
    return null
  }

  let segment: ListItem[] = []

  const flushSegment = () => {
    if (segment.length === 0) return

    const baseIndent = Math.min(...segment.map((item) => item.indent))
    const baseItems = segment.filter((item) => item.indent === baseIndent)
    const titleCount = baseItems.reduce((acc, item) => acc + (item.isTitle ? 1 : 0), 0)
    const firstTitle = baseItems.find((item) => item.isTitle)
    const canGroupAll =
      titleCount >= 2 ||
      (titleCount === 1 && firstTitle?.isStrongTitle)

    let inGroup = false
    for (const item of baseItems) {
      if (item.isTitle) {
        inGroup = true
        continue
      }
      if (!inGroup) continue

      const shouldIndent = canGroupAll || looksLikeGroupSubItem(item.content)
      if (!shouldIndent) continue

      next[item.index] = `  ${next[item.index]}`
      changed = true
    }

    segment = []
  }

  for (let i = 0; i < next.length; i += 1) {
    const line = next[i] || ''

    if (isFenceDelimiter(line)) {
      flushSegment()
      inFence = !inFence
      continue
    }
    if (inFence) continue

    const parsed = parseListItem(line)
    if (!parsed) {
      if (line.trim()) flushSegment()
      continue
    }

    segment.push({
      index: i,
      indent: parsed.indent,
      content: parsed.content,
      isTitle: looksLikeGroupTitle(parsed.content),
      isStrongTitle: looksLikeStrongGroupTitle(parsed.content),
    })
  }

  flushSegment()

  return { lines: next, changed }
}

function normalizeMarkdownInput(markdown: string, options: { autoNestList: boolean }): string {
  const rawLines = markdown.replace(/\r\n/g, '\n').split('\n')
  const normalizedLines: string[] = []
  let inFence = false
  let inLatexBlock = false

  for (const line of rawLines) {
    if (isFenceDelimiter(line)) {
      inFence = !inFence
      normalizedLines.push(line)
      continue
    }
    if (inFence) {
      normalizedLines.push(line)
      continue
    }
    
    // 检测 LaTeX 块级公式 $$...$$
    const dollarCount = (line.match(/\$\$/g) || []).length
    if (dollarCount === 1) {
      inLatexBlock = !inLatexBlock
      normalizedLines.push(line)
      continue
    }
    if (inLatexBlock) {
      normalizedLines.push(line)
      continue
    }
    
    normalizedLines.push(normalizeLeadingIndent(line))
  }

  let lines = normalizedLines
  if (options.autoNestList) {
    const nested = autoNestListLines(normalizedLines)
    lines = nested.changed ? nested.lines : normalizedLines
  }

  return normalizeGfmTableBlocks(lines).join('\n')
}

export function renderSimpleMarkdown(markdown: string, options: SimpleMarkdownRenderOptions = {}): string {
  resetHeadingCounters()
  
  const normalized = normalizeMarkdownInput(markdown || '', { autoNestList: options.autoNestList ?? false })
  if (!normalized.trim()) {
    return options.emptyHtml || ''
  }
  
  const env: Record<string, unknown> = {}
  if (options.imageBasePath) {
    env.imageBasePath = options.imageBasePath
  }
  if (options.workspace) {
    env.workspace = options.workspace
  }
  if (options.authToken) {
    env.authToken = options.authToken
  }
  
  const processedContent = processLatex(normalized)
  
  return markdownRenderer.render(processedContent, env)
}

export function extractTocHeadings(markdown: string): { level: number; text: string; id: string }[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const headings: { level: number; text: string; id: string }[] = []
  let inCodeBlock = false
  let codeBlockFence = ''
  
  for (const line of lines) {
    // Check for fenced code block start/end
    const fenceMatch = line.match(/^(\s*)(`{3,}|~{3,})/)
    if (fenceMatch) {
      const fence = fenceMatch[2] || ''
      if (!inCodeBlock) {
        inCodeBlock = true
        codeBlockFence = fence
      } else if (fence.startsWith(codeBlockFence[0] || '')) {
        inCodeBlock = false
        codeBlockFence = ''
      }
      continue
    }
    
    // Skip lines inside code blocks
    if (inCodeBlock) continue
    
    // Skip indented code blocks (4 spaces or 1 tab)
    if (/^(    |\t)/.test(line)) continue
    
    const match = line.match(/^(#{1,6})\s+(.+)$/)
    if (match) {
      const level = match[1]?.length || 1
      const text = (match[2] || '').trim()
      const id = text.toLowerCase().replace(/[^\w\u4e00-\u9fa5]+/g, '-')
      headings.push({ level, text, id })
    }
  }
  
  return headings
}
