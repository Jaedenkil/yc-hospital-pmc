// ============================================================
// 导出工具：Excel（真实 .xlsx 文件）与报表打印（浏览器打印 → 另存为 PDF）
// 对应需求原文：全部业务数据支持导出 Excel、PDF，报表支持打印
// ============================================================

import * as XLSX from 'xlsx'

export interface SheetSpec {
  /** 工作表名（Excel 限制 31 字符） */
  name: string
  /** 表头行 */
  header?: string[]
  /** 数据行 */
  rows: (string | number)[][]
  /** 列宽（字符数），与表头列数对应 */
  colWidth?: number[]
}

/** 导出 .xlsx（支持多工作表） */
export function exportExcel(fileName: string, sheets: SheetSpec[]) {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const aoa = s.header?.length ? [s.header, ...s.rows] : s.rows
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    if (s.colWidth?.length) ws['!cols'] = s.colWidth.map((wch) => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31))
  }
  XLSX.writeFile(wb, `${fileName}.xlsx`)
}

export type Align = 'left' | 'right' | 'center'

export interface PrintTableSpec {
  /** 报表标题 */
  title: string
  /** 副标题：统计口径 / 项目名称等 */
  subtitle?: string
  /** 表头 */
  header: string[]
  /** 数据行 */
  rows: (string | number)[][]
  /** 各列对齐方式，默认左对齐 */
  align?: Align[]
  /** 页脚左侧说明（数据来源等） */
  footer?: string
  /** 横向排版（列较多的报表用） */
  landscape?: boolean
}

function esc(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function nowStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function buildCss(landscape: boolean): string {
  return `
@page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Microsoft YaHei', 'PingFang SC', 'SimSun', sans-serif; color: #1f2329; }
h1 { margin: 0 0 6px; font-size: 17px; text-align: center; letter-spacing: 1px; }
.sub { margin-bottom: 10px; font-size: 12px; color: #4e5969; text-align: center; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th, td { padding: 4px 6px; border: 1px solid #9aa3b0; vertical-align: top; word-break: break-all; }
th { font-weight: 600; background: #eef4ff; text-align: center; white-space: nowrap; }
tbody tr:nth-child(even) td { background: #fafbfd; }
.foot { display: flex; justify-content: space-between; margin-top: 10px; font-size: 11px; color: #4e5969; }
`
}

/**
 * 打印标准报表：浏览器打印对话框中选「另存为 PDF」即得到 PDF 文件
 * 用隐藏 iframe 承载，不会被浏览器的弹窗拦截器挡下
 */
export function printTable(spec: PrintTableSpec) {
  const align = spec.align ?? []
  const headerHtml = spec.header
    .map((h, i) => `<th style="text-align:${align[i] ?? 'center'}">${esc(h)}</th>`)
    .join('')
  const bodyHtml = spec.rows
    .map(
      (r) =>
        `<tr>${r
          .map((c, i) => `<td style="text-align:${align[i] ?? 'left'}">${esc(String(c ?? ''))}</td>`)
          .join('')}</tr>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(spec.title)}</title>
<style>${buildCss(!!spec.landscape)}</style></head>
<body>
  <h1>${esc(spec.title)}</h1>
  ${spec.subtitle ? `<div class="sub">${esc(spec.subtitle)}</div>` : ''}
  <table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>
  <div class="foot"><span>${esc(spec.footer ?? '公立医院改革与高质量发展示范项目 · 信息化全流程项目管控平台')}</span><span>打印时间：${nowStamp()}</span></div>
</body></html>`

  printHtml(html)
}

/** 把一段完整 HTML 通过隐藏 iframe 送去打印 */
export function printHtml(html: string) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  const win = iframe.contentWindow
  if (!doc || !win) {
    document.body.removeChild(iframe)
    return
  }
  doc.open()
  doc.write(html)
  doc.close()

  // 等一帧让样式与表格布局生效，再唤起打印
  setTimeout(() => {
    win.focus()
    win.print()
    setTimeout(() => document.body.removeChild(iframe), 3000)
  }, 120)
}

/** 从列表构建 Excel 行（统一的字段顺序，供各模块复用） */
export function pick<T>(row: T, keys: (keyof T)[]): (string | number)[] {
  return keys.map((k) => {
    const v = row[k]
    if (v === null || v === undefined) return ''
    if (typeof v === 'number' || typeof v === 'string') return v
    return String(v)
  })
}
