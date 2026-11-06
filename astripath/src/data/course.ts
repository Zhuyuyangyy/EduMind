import type { DemoCourse } from '../logic/types.ts'

/**
 * 演示课程（示例数据）：《Python 数据分析基础》
 * 内容为竞赛演示用途编写的虚构教学材料，不对应任何真实课程或学生。
 */
export const demoCourse: DemoCourse = {
  id: 'python-data-analysis',
  name: 'Python 数据分析基础',
  subtitle: '从数据类型到分组聚合的数据分析入门课',
  description:
    '面向高校学生的数据分析入门课程。覆盖 Python 基础与数据类型、NumPy 数组操作、Pandas 数据读取与清洗、分组聚合与数据可视化，帮助学习者建立完整的数据分析工作流。',
  goals: [
    '熟练掌握 Python 基础语法与常用数据类型',
    '使用 NumPy 进行数组化数值计算',
    '使用 Pandas 完成数据读取、清洗、筛选与分组聚合',
    '使用 Matplotlib / Seaborn 完成常见数据可视化',
    '独立完成一个小型数据分析综合项目'
  ],
  level: '入门',
  knowledgePoints: [
    {
      id: 'py-basics',
      name: 'Python 基础与数据类型',
      category: 'Python 基础',
      description: '变量、数值与字符串类型、真除法与地板除、列表/元组/字典/集合等常用数据结构。',
      prerequisites: [],
      estMinutes: 25
    },
    {
      id: 'numpy-basics',
      name: 'NumPy 数组操作',
      category: 'Python 基础',
      description: 'ndarray 创建与属性、逐元素运算与广播、索引与切片、常用统计函数。',
      prerequisites: ['py-basics'],
      estMinutes: 30
    },
    {
      id: 'pandas-io',
      name: 'Pandas 数据读取',
      category: 'Pandas',
      description: 'Series 与 DataFrame、read_csv 常用参数、shape/dtypes/head 等快速检视方法。',
      prerequisites: ['py-basics'],
      estMinutes: 25
    },
    {
      id: 'pandas-clean',
      name: '缺失值处理与数据清洗',
      category: 'Pandas',
      description: '缺失值识别与填充、重复值处理、字符串清洗、类型转换，数据泄漏防范意识。',
      prerequisites: ['pandas-io'],
      estMinutes: 30
    },
    {
      id: 'pandas-select',
      name: '数据筛选与变换',
      category: 'Pandas',
      description: '布尔索引、loc/iloc 标签与位置索引、条件筛选、排序与类型转换。',
      prerequisites: ['pandas-io'],
      estMinutes: 25
    },
    {
      id: 'groupby-agg',
      name: 'GroupBy 分组聚合',
      category: 'Pandas',
      description: 'split-apply-combine 思想、单列/多列分组、agg 多指标聚合、transform 与 apply。',
      prerequisites: ['pandas-clean'],
      estMinutes: 30
    },
    {
      id: 'viz-basic',
      name: '数据可视化',
      category: '可视化',
      description: 'Matplotlib 与 Seaborn 绘图基础、图形选型、中文显示与图形导出。',
      prerequisites: ['pandas-clean'],
      estMinutes: 30
    },
    {
      id: 'merge-concat',
      name: '数据合并与连接',
      category: 'Pandas',
      description: 'merge 按键连接（inner/left/right/outer）、concat 按轴堆叠、键重复导致的行数膨胀问题。',
      prerequisites: ['pandas-io'],
      estMinutes: 25
    }
  ]
}

export const kpMap: Record<string, (typeof demoCourse.knowledgePoints)[number]> = Object.fromEntries(
  demoCourse.knowledgePoints.map((kp) => [kp.id, kp])
)

export function getKp(kpId: string) {
  const kp = kpMap[kpId]
  if (!kp) throw new Error(`未知知识点: ${kpId}`)
  return kp
}
