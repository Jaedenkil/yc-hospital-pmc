import { computed, onBeforeUnmount, onMounted, ref, type ComputedRef, type Ref } from 'vue'

/** 表格自适应高度的参数 */
export interface TableScrollOptions {
  /** 最少展示的数据行数：内容不足时按此高度兜底，避免表格被压得过矮 */
  minRows?: number
  /** 单行估算高度（px）：small ≈ 39 / middle ≈ 47 / large ≈ 55 */
  rowHeight?: number
  /** 除表头与分页外还需扣减的高度（px），如卡片内边距、表格上方工具栏 */
  reserved?: number
}

export interface UseTableScrollReturn {
  /** 绑定到表格外层容器（通常同时带 .pmc-fill 类，高度由 flex 计算得出） */
  wrapRef: Ref<HTMLElement | null>
  /** 直接传给 a-table 的 :scroll 属性 */
  tableScroll: ComputedRef<{ y: number }>
}

/**
 * 表格高度自适应：让表体占满卡片剩余空间并在内部滚动，外部页面不被撑开。
 *
 * 计算方式：scroll.y = 容器可视高度 − 表头高度 − 分页高度 − 额外扣减，
 * 且不小于「最少行数 × 行高」，因此：
 *   · 数据多于可视行数 → 表体内部滚动（表头与分页固定在两端）
 *   · 数据不足最少行数 → 表格按最少行数兜底，不会挤成一条缝
 *
 * 用法：
 *   const { wrapRef, tableScroll } = useTableScroll({ minRows: 3 })
 *   <a-card class="pmc-fill" :body-style="{ display: 'flex', flexDirection: 'column' }">
 *     <div ref="wrapRef" class="pmc-fill">
 *       <a-table :scroll="tableScroll" ... />
 *     </div>
 *   </a-card>
 */
export function useTableScroll(options: TableScrollOptions = {}): UseTableScrollReturn {
  const { minRows = 3, rowHeight = 40, reserved = 0 } = options

  const wrapRef = ref<HTMLElement | null>(null)
  const scrollY = ref(minRows * rowHeight)
  let observer: ResizeObserver | null = null

  /** 容器可以是原生元素，也可以是组件实例（自动取 $el），便于直接绑在 a-card 上 */
  function resolveEl(target: unknown): HTMLElement | null {
    if (!target) return null
    if (target instanceof HTMLElement) return target
    const el = (target as { $el?: unknown }).$el
    return el instanceof HTMLElement ? el : null
  }

  /** 量取一次容器与表头/分页高度，换算成表体可滚动高度 */
  function measure() {
    const host = resolveEl(wrapRef.value)
    if (!host) return
    // a-card 场景：以卡片内容区为基准测量，自动排除卡片内边距的影响
    const box = (host.querySelector('.ant-card-body') as HTMLElement | null) ?? host
    const head = box.querySelector('.ant-table-thead') as HTMLElement | null
    const pager = box.querySelector('.ant-table-pagination') as HTMLElement | null
    const headH = head?.offsetHeight ?? rowHeight
    const pagerH = pager ? pager.offsetHeight + 16 : 0
    const available = box.clientHeight - headH - pagerH - reserved
    scrollY.value = Math.max(minRows * rowHeight, Math.floor(available))
  }

  onMounted(() => {
    measure()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure())
      if (wrapRef.value) observer.observe(wrapRef.value)
    }
    window.addEventListener('resize', measure)
  })

  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
    window.removeEventListener('resize', measure)
  })

  return { wrapRef, tableScroll: computed(() => ({ y: scrollY.value })) }
}

/** 表格自适应高度返回的表体滚动属性中，y 的最小值（供页面兜底判断使用） */
export const TABLE_MIN_Y = 120
