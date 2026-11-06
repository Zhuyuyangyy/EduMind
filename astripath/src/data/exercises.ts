import type { Exercise } from '../logic/types.ts'

/** 练习题库（示例数据）：每个知识点 3 题，与知识点绑定，提交后即时判分 */
export const exercises: Exercise[] = [
  // —— Python 基础与数据类型 ——
  {
    id: 'e-py-1',
    kpId: 'py-basics',
    difficulty: 'easy',
    prompt: "Python 中 bool(0)、bool('')、bool([]) 的值依次是？",
    choices: ['True, True, True', 'False, False, False', 'True, False, True', 'False, True, False'],
    answer: 1,
    explanation:
      '0、空字符串、空列表都是「假值」，bool() 均为 False。数据分析中常用这一特性做空值判断，例如 if not df: 判断数据是否为空。'
  },
  {
    id: 'e-py-2',
    kpId: 'py-basics',
    difficulty: 'easy',
    prompt: "表达式 'data' + 'analysis' 与 'data' * 2 的结果分别是？",
    choices: [
      "'dataanalysis' 和 'datadata'",
      "'datadata' 和 'dataanalysis'",
      "'data analysis' 和 'datadata'",
      '两者都会报错'
    ],
    answer: 0,
    explanation: '字符串 + 是拼接，* 是重复。这是 Python 内置类型的行为，与 NumPy 数组的逐元素运算语义不同。'
  },
  {
    id: 'e-py-3',
    kpId: 'py-basics',
    difficulty: 'medium',
    prompt: "d = {'a': 1}; d['b'] = 2; print(len(d)) 的输出是？",
    choices: ['1', '2', '3', "{'a': 1, 'b': 2}"],
    answer: 1,
    explanation:
      '字典通过键赋值动态新增条目，len() 返回键值对数量。字典是数据分析中最常用的结构之一（如配置项、映射表）。'
  },
  // —— NumPy 数组操作 ——
  {
    id: 'e-np-1',
    kpId: 'numpy-basics',
    difficulty: 'easy',
    prompt: 'np.arange(0, 10, 2) 生成的数组是？',
    choices: ['array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])', 'array([0, 2, 4, 6, 8])', 'array([2, 4, 6, 8, 10])', 'array([0, 2, 4, 6, 8, 10])'],
    answer: 1,
    explanation: 'arange(start, stop, step) 从 start 到 stop（不含）按 step 步长生成，因此结果是 [0, 2, 4, 6, 8]。'
  },
  {
    id: 'e-np-2',
    kpId: 'numpy-basics',
    difficulty: 'medium',
    prompt: "a = np.array([[1, 2], [3, 4]]); a[1, 0] 的值是？",
    choices: ['1', '2', '3', '4'],
    answer: 2,
    explanation:
      '二维数组用 arr[行, 列] 索引，a[1, 0] 取第 2 行第 1 列，即 3。arr[1] 取整行，arr[:, 0] 取整列。'
  },
  {
    id: 'e-np-3',
    kpId: 'numpy-basics',
    difficulty: 'medium',
    prompt: 'np.mean([1, np.nan, 3]) 的结果是？',
    choices: ['2.0', '1.5', 'nan', '报错'],
    answer: 2,
    explanation:
      'NumPy 的均值不忽略 NaN，结果会被「污染」为 nan。正确做法是先清洗（如 np.nanmean），这也说明了数据清洗在分析流程中的前置地位。'
  },
  // —— Pandas 数据读取 ——
  {
    id: 'e-pdio-1',
    kpId: 'pandas-io',
    difficulty: 'easy',
    prompt: 'df.head() 默认返回 DataFrame 的前几行？',
    choices: ['前 3 行', '前 5 行', '前 10 行', '全部行'],
    answer: 1,
    explanation: 'head() 默认 5 行，可传参修改（如 head(20)）。拿到新数据的第一步就是用 head() 快速检视结构。'
  },
  {
    id: 'e-pdio-2',
    kpId: 'pandas-io',
    difficulty: 'medium',
    prompt: "df.shape 返回 (120, 8) 时，下列说法正确的是？",
    choices: [
      '共 120 列 8 行',
      '共 120 行 8 列，len(df) 等于 120',
      '共 8 行 120 列',
      'shape 与 len(df) 永远相等'
    ],
    answer: 1,
    explanation: 'shape 是 (行数, 列数)；len(df) 返回行数。读取数据后应第一时间确认 shape，判断数据量是否符合预期。'
  },
  {
    id: 'e-pdio-3',
    kpId: 'pandas-io',
    difficulty: 'medium',
    prompt: 'df.dtypes 的作用是？',
    choices: [
      '查看每列的数据类型',
      '删除类型不符的列',
      '把每列转换为字符串',
      '查看每列的缺失值数量'
    ],
    answer: 0,
    explanation:
      'dtypes 展示每列 dtype。类型错误（如数字被读成字符串）是后续计算出错的常见原因，发现后应及时用 astype 转换。'
  },
  // —— 缺失值处理与数据清洗 ——
  {
    id: 'e-pdcl-1',
    kpId: 'pandas-clean',
    difficulty: 'easy',
    prompt: 'df.isnull().sum() 的作用是？',
    choices: [
      '删除全部缺失值',
      '统计每列的缺失值数量',
      '用 0 填充缺失值',
      '判断数据是否有重复行'
    ],
    answer: 1,
    explanation: 'isnull() 生成布尔掩码，sum() 按列汇总 True 的数量，即每列缺失值计数，是清洗前的标准检查动作。'
  },
  {
    id: 'e-pdcl-2',
    kpId: 'pandas-clean',
    difficulty: 'medium',
    prompt: 'df.drop_duplicates() 的默认行为是？',
    choices: [
      '删除所有重复列',
      '保留重复行中最后一次出现的记录',
      '保留重复行中首次出现的记录，删除其余重复行',
      '只删除完全相同的列名'
    ],
    answer: 2,
    explanation:
      '默认 keep="first"，保留首次出现。可按 subset 指定判重列，如 df.drop_duplicates(subset=["user_id"]) 按用户去重。'
  },
  {
    id: 'e-pdcl-3',
    kpId: 'pandas-clean',
    difficulty: 'hard',
    prompt: "某列是字符串类型但包含 ' 深圳 '、'深圳 '、' 深圳' 等脏数据，最规范的处理是？",
    choices: [
      "df['city'].strip()",
      "df['city'].str.strip()",
      'df.replace(" ", "")',
      '无需处理，分组聚合会自动忽略空格'
    ],
    answer: 1,
    explanation:
      '字符串列必须通过 .str 访问器调用 strip() 去首尾空格。未清洗的空格会导致分组聚合时同一城市被拆成多组，是经典数据事故。'
  },
  // —— 数据筛选与变换 ——
  {
    id: 'e-pdsel-1',
    kpId: 'pandas-select',
    difficulty: 'easy',
    prompt: 'df.iloc[0:2] 选取的是？',
    choices: ['第 0 到第 2 行（含第 2 行）', '前 2 行（第 0、1 行）', '第 1 到第 2 行', '前 2 列'],
    answer: 1,
    explanation: 'iloc 是纯位置索引，切片遵循 Python 惯例「左闭右开」，0:2 取第 0、1 两行。'
  },
  {
    id: 'e-pdsel-2',
    kpId: 'pandas-select',
    difficulty: 'medium',
    prompt: "筛选 df 中 score 在 60 到 80 之间（含端点）的行，正确的是？",
    choices: [
      "df[df['score'].between(60, 80)]",
      "df['score'].between(60, 80)",
      "df[df['score'] > 60 and df['score'] < 80]",
      "df.filter('score', 60, 80)"
    ],
    answer: 0,
    explanation:
      'Series.between(left, right) 默认含端点，返回布尔掩码，再用 df[掩码] 筛选行。Series 间的逻辑运算要用 & 和 |，不能用 and/or。'
  },
  {
    id: 'e-pdsel-3',
    kpId: 'pandas-select',
    difficulty: 'medium',
    prompt: "df.sort_values('score', ascending=False) 的效果是？",
    choices: [
      '按 score 升序排列并返回新 DataFrame（原表不变）',
      '按 score 降序排列并返回新 DataFrame（原表不变）',
      '就地修改原表为降序，无返回值',
      '按索引排序'
    ],
    answer: 1,
    explanation:
      'ascending=False 即降序。默认返回新对象、原表不变；需要就地修改时传 inplace=True。分析「Top N」场景前常用降序排序。'
  },
  // —— GroupBy 分组聚合 ——
  {
    id: 'e-gb-1',
    kpId: 'groupby-agg',
    difficulty: 'easy',
    prompt: "df.groupby('dept')['salary'].agg(['mean', 'count']) 的结果是？",
    choices: [
      '每个部门的平均薪资',
      '每个部门的平均薪资与人数（两列）',
      '全公司平均薪资',
      '每个部门的薪资明细'
    ],
    answer: 1,
    explanation: 'agg 接收函数列表，一次计算多个指标，结果每个指标一列。这是生成汇总报表最常用的写法。'
  },
  {
    id: 'e-gb-2',
    kpId: 'groupby-agg',
    difficulty: 'hard',
    prompt: "df.groupby('dept')['salary'].transform('mean') 与 .mean() 的核心区别是？",
    choices: [
      '两者结果完全相同',
      'transform 把组均值广播回原表的每一行（保持原形状），mean() 返回每组一个值',
      'mean() 保持原形状，transform 返回每组一个值',
      'transform 只能用于数值列'
    ],
    answer: 1,
    explanation:
      'transform 的返回长度与原数据一致，适合构造「与组均值比较」这类行级特征；mean() 是规约结果，每组一行。'
  },
  {
    id: 'e-gb-3',
    kpId: 'groupby-agg',
    difficulty: 'medium',
    prompt: "df.groupby(['year', 'month'])['sales'].sum() 的分组维度是？",
    choices: ['仅按 year 分组', '仅按 month 分组', '按 year 与 month 的组合（多级索引）分组', '按行号分组'],
    answer: 2,
    explanation: '传入列表即多列分组，结果带 MultiIndex。需要还原成普通列时用 reset_index()。'
  },
  // —— 数据可视化 ——
  {
    id: 'e-viz-1',
    kpId: 'viz-basic',
    difficulty: 'easy',
    prompt: 'Matplotlib 图表中文显示为方框（乱码）的常见原因是？',
    choices: [
      '数据中含有中文字符串',
      '未配置中文字体，默认字体不含中文字形',
      '图片尺寸太小',
      '必须使用 Seaborn 才能显示中文'
    ],
    answer: 1,
    explanation:
      '需通过 plt.rcParams["font.sans-serif"] 指定系统中文字体（如 SimHei、PingFang SC），并设置 axes.unicode_minus=False 解决负号显示。'
  },
  {
    id: 'e-viz-2',
    kpId: 'viz-basic',
    difficulty: 'medium',
    prompt: "sns.barplot(x='dept', y='salary', data=df) 绘制的是？",
    choices: [
      '各部门薪资的散点分布',
      '各部门薪资均值的柱状图（默认带置信区间）',
      '薪资的直方图',
      '部门间的折线趋势'
    ],
    answer: 1,
    explanation:
      'barplot 默认对每个分类计算均值并画柱，误差棒为置信区间。想看分布细节可换 boxplot / violinplot。'
  },
  {
    id: 'e-viz-3',
    kpId: 'viz-basic',
    difficulty: 'medium',
    prompt: '批量生成图表后未调用 plt.close() 可能导致的问题是？',
    choices: [
      '图片无法保存',
      '图形对象累积导致内存占用持续增长（尤其是在循环中）',
      '坐标轴标签丢失',
      '没有任何影响'
    ],
    answer: 1,
    explanation:
      'Matplotlib 图形不会自动释放，循环绘图应使用 plt.close(fig) 或 plt.close("all")。保存用 plt.savefig(name, dpi=300, bbox_inches="tight")。'
  },
  // —— 数据合并与连接 ——
  {
    id: 'e-mg-1',
    kpId: 'merge-concat',
    difficulty: 'easy',
    prompt: "pd.merge(orders, users, on='user_id', how='left') 的结果一定满足？",
    choices: [
      '保留两个表的全部行',
      '保留 orders（左表）的全部行，users 中无匹配的键填充 NaN',
      '只保留两表都存在的行',
      '结果行数等于两表行数之和'
    ],
    answer: 1,
    explanation: "how='left' 以左表为准保留全部行；how='inner' 只保留匹配行；how='outer' 保留两边全部行。"
  },
  {
    id: 'e-mg-2',
    kpId: 'merge-concat',
    difficulty: 'hard',
    prompt: 'merge 之后结果行数明显多于原表，最可能的原因是？',
    choices: [
      '内存不足',
      '连接键在某一侧存在重复值（一对多/多对多）',
      '必须使用 concat 代替 merge',
      '列名拼写错误'
    ],
    answer: 1,
    explanation:
      '键重复会造成笛卡尔式膨胀（如左表 100 行、右表同键 3 条，结果 300 行）。merge 前应检查键的唯一性，或用 validate 参数断言一对一。'
  },
  {
    id: 'e-mg-3',
    kpId: 'merge-concat',
    difficulty: 'medium',
    prompt: '关于 pd.concat([df1, df2], axis=1) 的说法正确的是？',
    choices: [
      '按行方向堆叠，要求列名一致',
      '按列方向拼接，按索引对齐，列可不同',
      '按 user_id 键连接',
      '只能用于两个行数相同的表'
    ],
    answer: 1,
    explanation:
      'axis=1 按列拼接并基于索引对齐；axis=0（默认）按行堆叠，通常要求列结构一致。join="inner"/"outer" 控制索引交集/并集。'
  }
]

export const exercisesByKp: Record<string, Exercise[]> = exercises.reduce<Record<string, Exercise[]>>(
  (acc, ex) => {
    ;(acc[ex.kpId] ??= []).push(ex)
    return acc
  },
  {}
)

export function getExercise(id: string): Exercise {
  const ex = exercises.find((e) => e.id === id)
  if (!ex) throw new Error(`未知练习: ${id}`)
  return ex
}
