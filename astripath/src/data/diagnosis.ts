import type { DiagnosisQuestion } from '../logic/types.ts'

/** 诊断题库（示例数据）：8 题，每题覆盖 1 个知识点，覆盖任务书要求的 5 个知识域 */
export const diagnosisQuestions: DiagnosisQuestion[] = [
  {
    id: 'd-py-div',
    kpId: 'py-basics',
    prompt: '在 Python 3 中，表达式 7 / 2 与 7 // 2 的结果分别是？',
    choices: ['3.5 和 3', '3 和 3.5', '3.5 和 3.5', '3 和 3'],
    answer: 0,
    explanation:
      '/ 是真除法，总是返回 float（7/2 = 3.5）；// 是地板除法，返回商的整数部分（7//2 = 3）。数据分析中计算均值、比率、占比时必须区分两者。'
  },
  {
    id: 'd-numpy-mul',
    kpId: 'numpy-basics',
    prompt: "import numpy as np; a = np.array([1, 2, 3]); print(a * 2) 的输出是？",
    choices: ['[1 2 3 1 2 3]', '[2 4 6]', '[1 4 9]', '[2 3 4]'],
    answer: 1,
    explanation:
      'NumPy 数组的 * 是逐元素运算，标量 2 会广播到每个元素，得到 [2 4 6]。列表的 * 才是重复拼接；a ** 2 才会得到 [1 4 9]。'
  },
  {
    id: 'd-pandas-readcsv',
    kpId: 'pandas-io',
    prompt: "用 Pandas 读取 CSV 文件 data.csv 为 DataFrame，下列写法正确的是？",
    choices: ["pd.read_excel('data.csv')", "pd.read_csv('data.csv')", "pd.load_csv('data.csv')", "pd.open('data.csv')"],
    answer: 1,
    explanation:
      'read_csv 是 Pandas 读取 CSV 的标准入口。常用参数：sep 指定分隔符、encoding 指定编码、na_values 指定额外缺失值标记。'
  },
  {
    id: 'd-pandas-fillna',
    kpId: 'pandas-clean',
    prompt: "DataFrame df 中某列存在缺失值，df['col'].fillna(df['col'].mean()) 的作用是？",
    choices: [
      '删除所有包含缺失值的行',
      '用该列的均值填充缺失值',
      '把该列所有值都替换为均值',
      '统计该列缺失值个数'
    ],
    answer: 1,
    explanation:
      'fillna 只替换 NaN 位置。删除缺失行用 dropna；统计缺失用 isnull().sum()。注意：用均值填充仅适用于数值列，且统计量应来自训练集，避免数据泄漏。'
  },
  {
    id: 'd-pandas-loc',
    kpId: 'pandas-select',
    prompt: "df.loc[df['age'] > 18, 'name'] 的作用是？",
    choices: [
      '按行号取第 18 行的 name 列',
      '筛选 age 大于 18 的行，并取这些行的 name 列',
      '把 age 大于 18 的值改写为 name',
      '语法错误，loc 不支持布尔索引'
    ],
    answer: 1,
    explanation:
      'loc 按标签索引：第一个参数是行布尔掩码，第二个参数是列名，组合实现「条件筛选 + 取列」。iloc 才是纯整数位置索引。'
  },
  {
    id: 'd-groupby-mean',
    kpId: 'groupby-agg',
    prompt: "df.groupby('city')['sales'].mean() 返回的结果是？",
    choices: [
      '所有城市 sales 的总体均值（一个数）',
      '每个城市 sales 的均值，索引为城市名',
      '每个城市的行数',
      '按城市排序后的 sales 列'
    ],
    answer: 1,
    explanation:
      'groupby 遵循 split-apply-combine：按 city 拆分成多个组，对每组 sales 求均值后再合并。统计行数用 size() 或 count()。'
  },
  {
    id: 'd-viz-scatter',
    kpId: 'viz-basic',
    prompt: '要观察两个数值变量之间的相关关系与联合分布，最合适的图形是？',
    choices: ['饼图', '散点图（可配合边际直方图）', '柱状图', '漏斗图'],
    answer: 1,
    explanation:
      '散点图用于观察两个数值变量的相关性、聚类与异常点；饼图只适合少量类别的构成占比；柱状图适合分类维度的数值比较。'
  },
  {
    id: 'd-merge-vs-concat',
    kpId: 'merge-concat',
    prompt: "关于 pd.merge(a, b, on='id') 与 pd.concat([a, b])，下列说法正确的是？",
    choices: [
      'merge 按行堆叠，concat 按键连接',
      'merge 按键连接（默认 inner join），concat 按轴堆叠',
      '两者功能完全等价',
      'concat 只能用于列数不同的表'
    ],
    answer: 1,
    explanation:
      'merge 是关系型连接，on 指定键、how 指定 inner/left/right/outer；concat 是物理堆叠，axis=0 按行、axis=1 按列，不做键匹配。'
  }
]
