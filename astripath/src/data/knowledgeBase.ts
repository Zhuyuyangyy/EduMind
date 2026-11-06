import type { KbCard } from '../logic/types.ts'

/**
 * AI 导师演示知识库（示例数据）。
 * 演示模式：回答来自以下预置课程卡片的检索匹配，并非实时大模型生成。
 * 每张卡片标注引用依据（课程资料出处），保证讲解可追溯。
 */
export const knowledgeBase: KbCard[] = [
  {
    id: 'kb-py-basics',
    kpId: 'py-basics',
    title: 'Python 基础与数据类型速查',
    keywords: [
      'python基础', '数据类型', 'int', 'float', 'str', '列表', '元组', '字典', '集合',
      '真除法', '地板除', '//', '/', '布尔', '列表和元组的区别'
    ],
    concept:
      'Python 内置类型分为数值（int/float）、布尔（bool）、序列（str/list/tuple）与映射（dict）等。数据分析中最关键的三个细节：\n1. 除法语义：/ 真除法返回 float，// 地板除法返回 int，计算比率时用 /，分桶/分页时用 //；\n2. 可变性：list 可变、tuple 不可变，tuple 元素可哈希时可作字典键；\n3. 假值判断：0、""、[]、{}、None 的 bool 值均为 False，可用于空值快查。',
    example:
      "rate = correct / total          # 3/2 -> 1.5（float）\npage = idx // 20               # 分页：向下取整\nkp_tags = ('numpy', 'pandas')  # tuple 可作 dict 键\nif not rows:                    # 空列表快捷判断\n    print('数据为空')",
    pitfalls: [
      '误用 // 计算比率，导致结果被向下取整丢精度',
      '把 list 当字典键会报 TypeError: unhashable type',
      '字符串不可变，所谓 "s[0] = \'x\'" 会直接报错'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 1 章 Python 基础与数据类型（演示材料）',
    relatedExercises: ['e-py-1', 'e-py-2', 'e-py-3'],
    followUps: ['列表和元组有什么区别？', '字典的键有什么要求？', '真除法和的分别是什么？']
  },
  {
    id: 'kb-numpy-basics',
    kpId: 'numpy-basics',
    title: 'NumPy 数组操作核心',
    keywords: [
      'numpy', 'ndarray', '数组', '广播', 'broadcasting', 'shape', 'arange', '索引',
      '切片', '逐元素', 'nan', '均值', '二维数组'
    ],
    concept:
      'ndarray 是同质多维数组，运算默认逐元素进行。核心概念：\n1. 广播：标量或形状兼容的数组自动扩展到相同形状，如 a * 2；\n2. 索引：一维 a[i]，二维 a[行, 列]，a[:, 0] 取整列；\n3. NaN 传播：np.mean 不忽略 NaN，结果会被污染，需先清洗或用 np.nanmean。',
    example:
      "import numpy as np\na = np.array([1, 2, 3])\nb = a * 2            # 广播 -> array([2, 4, 6])\nm = np.array([[1, 2], [3, 4]])\nm[1, 0]              # -> 3（第 2 行第 1 列）\nnp.nanmean([1, np.nan, 3])   # -> 2.0（跳过 NaN）",
    pitfalls: [
      '把列表的 * 重复语义套到数组上（数组 * 是逐元素）',
      '忘记 NaN 会污染统计结果',
      '用 a.sum(axis=0) 时弄错轴方向：axis=0 按列聚合，axis=1 按行聚合'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 2 章 NumPy 数组操作（演示材料）',
    relatedExercises: ['e-np-1', 'e-np-2', 'e-np-3'],
    followUps: ['NumPy 的广播是什么？', '二维数组怎么索引？', '均值里有 NaN 怎么办？']
  },
  {
    id: 'kb-pandas-io',
    kpId: 'pandas-io',
    title: 'Pandas 数据读取与快速检视',
    keywords: [
      'pandas', 'dataframe', 'series', 'read_csv', '读取', 'csv', 'excel', 'head',
      'shape', 'dtypes', '检视', '数据结构'
    ],
    concept:
      'Series 是一维带标签数组，DataFrame 是二维表。读取 CSV 用 pd.read_csv()，关键参数：sep、encoding、na_values、dtype。拿到数据后的标准三步检视：df.head() 看内容、df.shape 看规模、df.dtypes 看类型。类型错误（数字被读成 object）会让后续计算静默出错。',
    example:
      "import pandas as pd\ndf = pd.read_csv('sales.csv', encoding='utf-8', na_values=['?'])\ndf.head()      # 前 5 行\ndf.shape       # (行数, 列数)\ndf.dtypes      # 每列类型",
    pitfalls: [
      '不指定 encoding 导致中文乱码',
      '不看 dtypes 直接求和，数字列被当字符串处理',
      '用 len(df) 当列数（它是行数，列数看 df.shape[1]）'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 3 章 Pandas 数据读取（演示材料）',
    relatedExercises: ['e-pdio-1', 'e-pdio-2', 'e-pdio-3'],
    followUps: ['read_csv 常用参数有哪些？', '怎么快速查看数据概况？', 'dtypes 显示 object 是什么意思？']
  },
  {
    id: 'kb-pandas-clean',
    kpId: 'pandas-clean',
    title: '缺失值处理与数据清洗',
    keywords: [
      '缺失值', '清洗', 'fillna', 'dropna', 'isnull', '重复值', 'drop_duplicates',
      'strip', '空格', '数据泄漏', 'astype', '类型转换', 'nan'
    ],
    concept:
      '清洗是分析的前置步骤，标准流程：查缺失（isnull().sum()）→ 定策略（填充/删除）→ 查重复（duplicated/drop_duplicates）→ 规范化字符串（.str.strip()）→ 校正类型（astype）。填充策略要按列语义选择：数值列可用均值/中位数，类别列可用众数或 "未知"；填充统计量必须只来自训练集，否则构成数据泄漏。',
    example:
      "df.isnull().sum()                       # 每列缺失计数\ndf['age'] = df['age'].fillna(df['age'].median())\ndf = df.drop_duplicates(subset=['order_id'])\ndf['city'] = df['city'].str.strip()        # 去首尾空格\ndf['amount'] = df['amount'].astype(float)",
    pitfalls: [
      '忘记去空格，同一城市被拆成多个分组',
      '用全量数据的均值填充，导致数据泄漏',
      '对非数值列调用 mean() 填充',
      '误用 df.strip()（字符串列必须通过 .str 访问器）'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 4 章 数据清洗（演示材料）',
    relatedExercises: ['e-pdcl-1', 'e-pdcl-2', 'e-pdcl-3'],
    followUps: ['缺失值应该删除还是填充？', '什么是数据泄漏？', '字符串里的空格怎么处理？']
  },
  {
    id: 'kb-pandas-select',
    kpId: 'pandas-select',
    title: '数据筛选与变换：loc/iloc 与布尔索引',
    keywords: [
      '筛选', 'loc', 'iloc', '布尔索引', '条件筛选', '排序', 'sort_values', 'between',
      '位置索引', '标签索引', '变换'
    ],
    concept:
      '条件筛选的标准写法是 df[布尔掩码]。loc 按标签索引（行列都能带布尔掩码），iloc 按整数位置索引。多条件用 & 和 | 且每个条件要加括号。Series 间不能用 and/or。切片遵循左闭右开。',
    example:
      "df.loc[df['age'] > 18, 'name']            # 条件筛选 + 取列\ndf[(df['score'] >= 60) & (df['city'] == '北京')]\ndf.iloc[0:2]                              # 前两行\ndf.sort_values('score', ascending=False)    # 降序",
    pitfalls: [
      '多条件写成 and/or（应使用 & / |）',
      '条件忘加括号导致优先级错误',
      '把 iloc 当标签索引用，换行顺序后结果错位',
      '以为 sort_values 默认就地修改（默认返回新对象）'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 5 章 数据筛选与变换（演示材料）',
    relatedExercises: ['e-pdsel-1', 'e-pdsel-2', 'e-pdsel-3'],
    followUps: ['loc 和 iloc 的区别？', '多条件筛选怎么写？', '怎么取分数前 10 名？']
  },
  {
    id: 'kb-groupby-agg',
    kpId: 'groupby-agg',
    title: 'GroupBy 分组聚合',
    keywords: [
      'groupby', '分组', '聚合', 'agg', 'mean', 'sum', 'count', 'transform',
      'split-apply-combine', '多级索引', 'reset_index', '汇总'
    ],
    concept:
      'groupby 遵循 split-apply-combine：按键拆分、组内计算、合并结果。单列分组返回以键为索引的 Series；多列分组返回 MultiIndex。agg 可一次算多个指标。transform 把组级结果广播回原行，用于构造行级特征（如「与组均值的差」）。',
    example:
      "df.groupby('city')['sales'].mean()                      # 各城市均值\ndf.groupby('dept')['salary'].agg(['mean', 'count'])       # 多指标\ndf.groupby(['year', 'month'])['sales'].sum().reset_index()\ndf['diff'] = df['sales'] - df.groupby('city')['sales'].transform('mean')",
    pitfalls: [
      '混淆 .mean()（每组一个值）与 .transform("mean")（广播回原行）',
      '忘记 reset_index()，后续 merge 时对不齐',
      '分组键中有 NaN 时该组会被默认丢弃（dropna=True）',
      '对分组结果直接画图，索引是城市名导致横轴异常'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 6 章 分组聚合（演示材料）',
    relatedExercises: ['e-gb-1', 'e-gb-2', 'e-gb-3'],
    followUps: ['groupby 的执行过程是什么？', 'agg 和 apply 怎么选？', '怎么算每个人与其组均值的差？']
  },
  {
    id: 'kb-viz-basic',
    kpId: 'viz-basic',
    title: '数据可视化基础与图形选型',
    keywords: [
      '可视化', 'matplotlib', 'seaborn', '散点图', '柱状图', '饼图', '直方图',
      'boxplot', '中文乱码', '字体', 'savefig', '选型', '图表'
    ],
    concept:
      '图形选型先于绘图：比较分类数值用柱状图，看数值关系用散点图，看分布用直方图/箱线图，看构成占比用饼图（类别宜少）。Matplotlib 是底层引擎，Seaborn 在其上提供统计图形。中文显示需设置 font.sans-serif 与 axes.unicode_minus=False。批量绘图后要 close 释放内存。',
    example:
      "import matplotlib.pyplot as plt\nimport seaborn as sns\nplt.rcParams['font.sans-serif'] = ['PingFang SC', 'SimHei']\nplt.rcParams['axes.unicode_minus'] = False\nsns.scatterplot(x='age', y='income', data=df)\nplt.savefig('scatter.png', dpi=300, bbox_inches='tight')\nplt.close()",
    pitfalls: [
      '不设中文字体导致乱码方框',
      '该用散点图时用了折线（暗示不存在的顺序关系）',
      '循环绘图不 close，内存持续增长',
      '饼图类别过多，面积难以比较'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 7 章 数据可视化（演示材料）',
    relatedExercises: ['e-viz-1', 'e-viz-2', 'e-viz-3'],
    followUps: ['中文乱码怎么解决？', '该用柱状图还是折线图？', '怎么导出高清图片？']
  },
  {
    id: 'kb-merge-concat',
    kpId: 'merge-concat',
    title: '数据合并：merge 与 concat',
    keywords: [
      'merge', 'concat', '合并', '连接', 'join', 'inner', 'left', 'outer',
      '键', '行数膨胀', '堆叠', '多对多', 'on'
    ],
    concept:
      'merge 是关系型连接：on 指定键，how 指定 inner/left/right/outer，类似 SQL JOIN。concat 是物理堆叠：axis=0 按行（列结构需一致）、axis=1 按列（按索引对齐）。合并前务必检查键的唯一性：键在一侧重复会造成一对多膨胀，结果行数远超预期。',
    example:
      "orders_users = pd.merge(orders, users, on='user_id', how='left')\nall_data = pd.concat([df_jan, df_feb], axis=0)          # 按月堆叠\nfeatures = pd.concat([num_df, cat_df], axis=1)            # 按列拼接\npd.merge(a, b, on='id', validate='one_to_one')             # 断言一对一",
    pitfalls: [
      '键重复导致行数笛卡尔式膨胀',
      '该用 merge（按键匹配）时用了 concat（只堆叠不匹配）',
      'axis=1 拼接时忽略索引对齐问题',
      '忘记 how 参数，默认 inner 悄悄丢掉了左表数据'
    ],
    source: '《Python 数据分析基础》课程讲义 · 第 8 章 数据合并与连接（演示材料）',
    relatedExercises: ['e-mg-1', 'e-mg-2', 'e-mg-3'],
    followUps: ['merge 和 concat 的区别？', 'merge 后行数变多怎么办？', 'left join 会丢数据吗？']
  }
]

export const kbByKp: Record<string, KbCard> = Object.fromEntries(
  knowledgeBase.map((card) => [card.kpId, card])
)
