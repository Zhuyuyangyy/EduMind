/**
 * 学习路径 → 资源中心 的完整资源数据
 * 从 mapTransforms.NODE_CONTENT 扩展而来
 * 每条资源包含 PPT 幻灯片内容，用于 PPTViewer 展示
 */

import type { Resource, Slide } from '@/types/edu-mind'

// ============================================================
//  领域 / 知识点 / 阶段 元数据
// ============================================================

interface TopicMeta { id: string; label: string }
interface DomainMeta { id: string; name: string; color: string; short: string; topics: TopicMeta[] }

export const DOMAINS: DomainMeta[] = [
  {
    id: 'math', name: '数学基础', color: '#7c3aed', short: '数学',
    topics: [
      { id: 'm1', label: '矩阵运算' },
      { id: 'm2', label: '特征值与分解' },
      { id: 'm3', label: '概率论' },
      { id: 'm4', label: '微积分' },
      { id: 'm5', label: '凸优化' },
    ],
  },
  {
    id: 'ml', name: '机器学习', color: '#3b82f6', short: 'ML',
    topics: [
      { id: 'ml1', label: '监督学习' },
      { id: 'ml2', label: '无监督学习' },
      { id: 'ml3', label: '决策树/随机森林' },
      { id: 'ml4', label: 'SVM' },
      { id: 'ml5', label: '集成学习' },
    ],
  },
  {
    id: 'dl', name: '深度学习', color: '#06d6a0', short: 'DL',
    topics: [
      { id: 'dl1', label: '神经网络' },
      { id: 'dl2', label: 'CNN' },
      { id: 'dl3', label: 'RNN/LSTM' },
      { id: 'dl4', label: 'Transformer' },
      { id: 'dl5', label: 'Attention' },
    ],
  },
  {
    id: 'algo', name: '算法与数据结构', color: '#f59e0b', short: '算法',
    topics: [
      { id: 'a1', label: '排序与查找' },
      { id: 'a2', label: '数据结构' },
      { id: 'a3', label: '图算法' },
      { id: 'a4', label: '动态规划' },
    ],
  },
  {
    id: 'eng', name: '工程实践', color: '#f43f5e', short: '工程',
    topics: [
      { id: 'e1', label: 'Python工程' },
      { id: 'e2', label: '版本控制' },
      { id: 'e3', label: '模型部署' },
    ],
  },
  {
    id: 'nlp', name: 'NLP与应用', color: '#00d4ff', short: 'NLP',
    topics: [
      { id: 'n1', label: '词向量' },
      { id: 'n2', label: 'LLM' },
      { id: 'n3', label: '微调与对齐' },
      { id: 'n4', label: '检索增强(RAG)' },
    ],
  },
]

export const STAGES = [
  { id: 'pre', label: '课前预习', icon: '📖', color: '#7c3aed' },
  { id: 'in', label: '课中答疑', icon: '💬', color: '#00d4ff' },
  { id: 'post', label: '课后巩固', icon: '🔄', color: '#06d6a0' },
  { id: 'eval', label: '阶段测评', icon: '📋', color: '#f59e0b' },
  { id: 'final', label: '期末辅导', icon: '🎓', color: '#f43f5e' },
]

// ============================================================
//  每个知识点 × 5阶段 × 2~3条资源的原始数据
// ============================================================

interface RawResource {
  title: string
  type: 'doc' | 'video' | 'exercise' | 'code'
}

type NodeContentMap = Record<string, RawResource[][]>

const NODE_CONTENT: NodeContentMap = {
  // ━━━━━━━━━ 数学基础 ━━━━━━━━━
  m1: [
    [{ title: '矩阵加减乘与转置概念', type: 'doc' }, { title: 'NumPy 矩阵创建与基本操作', type: 'video' }, { title: '线性方程组与矩阵关系', type: 'doc' }],
    [{ title: '矩阵乘法结合律常见疑问', type: 'video' }, { title: '逆矩阵与行列式的直觉理解', type: 'doc' }, { title: '分块矩阵运算技巧', type: 'video' }],
    [{ title: '矩阵乘法手算练习', type: 'exercise' }, { title: 'NumPy 矩阵运算编程题', type: 'code' }, { title: '特殊矩阵（对角/对称/稀疏）辨识', type: 'exercise' }],
    [{ title: '矩阵运算综合测试', type: 'exercise' }, { title: '矩阵在图像变换中的应用', type: 'exercise' }],
    [{ title: 'SVD 分解原理与应用', type: 'doc' }, { title: 'PCA 降维中的矩阵运算', type: 'video' }, { title: '矩阵分解在推荐系统中的角色', type: 'doc' }],
  ],
  m2: [
    [{ title: '特征值与特征向量的几何含义', type: 'doc' }, { title: '特征方程求解方法', type: 'video' }, { title: '对角化条件与步骤', type: 'doc' }],
    [{ title: '特征值在 PCA 中的作用', type: 'video' }, { title: '实对称矩阵的谱定理', type: 'doc' }, { title: '特征值与矩阵稳定性的关系', type: 'video' }],
    [{ title: '手动计算 2x2 矩阵特征值', type: 'exercise' }, { title: '用 sklearn 求协方差矩阵特征值', type: 'code' }, { title: '特征值分解验证练习', type: 'exercise' }],
    [{ title: '特征值综合测验', type: 'exercise' }, { title: '特征值在 PageRank 中的应用', type: 'exercise' }],
    [{ title: '特征值在动力系统中的意义', type: 'doc' }, { title: '谱聚类算法原理', type: 'video' }, { title: '特征值在量子计算中的角色', type: 'doc' }],
  ],
  m3: [
    [{ title: '随机变量与概率分布基础', type: 'doc' }, { title: '条件概率与贝叶斯公式', type: 'video' }, { title: '常见分布（正态/泊松/二项）概览', type: 'doc' }],
    [{ title: '贝叶斯推理在垃圾邮件过滤中的应用', type: 'video' }, { title: '联合分布与边缘分布的关系', type: 'doc' }, { title: '大数定律直觉理解', type: 'video' }],
    [{ title: '概率计算综合练习', type: 'exercise' }, { title: '用 Python 模拟概率实验', type: 'code' }, { title: '贝叶斯公式应用题', type: 'exercise' }],
    [{ title: '概率论阶段测评', type: 'exercise' }, { title: '概率在 ML 损失函数中的角色', type: 'exercise' }],
    [{ title: '概率图模型入门', type: 'doc' }, { title: '蒙特卡洛方法原理', type: 'video' }, { title: '概率论在自然语言处理中的应用', type: 'doc' }],
  ],
  m4: [
    [{ title: '导数的定义与几何意义', type: 'doc' }, { title: '常见函数求导公式速查', type: 'video' }, { title: '偏导数与梯度概念', type: 'doc' }],
    [{ title: '链式法则在反向传播中的应用', type: 'video' }, { title: '梯度下降法的数学推导', type: 'doc' }, { title: '多元函数极值条件', type: 'video' }],
    [{ title: '手算导数练习题', type: 'exercise' }, { title: '梯度下降手动模拟', type: 'exercise' }, { title: 'PyTorch 自动求导体验', type: 'code' }],
    [{ title: '微积分基础测验', type: 'exercise' }, { title: '导数在优化算法中的核心角色', type: 'exercise' }],
    [{ title: '积分在概率密度中的应用', type: 'doc' }, { title: '变分法入门', type: 'video' }, { title: '微积分在深度学习优化中的前沿', type: 'doc' }],
  ],
  m5: [
    [{ title: '凸集与凸函数定义', type: 'doc' }, { title: '优化问题分类（无约束/有约束）', type: 'video' }, { title: '局部最优与全局最优的区别', type: 'doc' }],
    [{ title: '拉格朗日乘子法原理', type: 'video' }, { title: 'SVM 中的凸优化应用', type: 'doc' }, { title: 'KKT 条件直觉理解', type: 'video' }],
    [{ title: '凸函数判定练习', type: 'exercise' }, { title: '用 cvxpy 解简单优化问题', type: 'code' }, { title: '约束优化手算题', type: 'exercise' }],
    [{ title: '凸优化综合测评', type: 'exercise' }, { title: '优化在模型训练中的实际意义', type: 'exercise' }],
    [{ title: '非凸优化与鞍点问题', type: 'doc' }, { title: '学习率调度策略', type: 'video' }, { title: '二阶优化方法（牛顿法）简介', type: 'doc' }],
  ],

  // ━━━━━━━━━ 机器学习 ━━━━━━━━━
  ml1: [
    [{ title: '监督学习基本框架（输入→标签）', type: 'doc' }, { title: '线性回归原理与公式推导', type: 'video' }, { title: '逻辑回归与 sigmoid 函数', type: 'doc' }],
    [{ title: '损失函数（MSE/CrossEntropy）详解', type: 'video' }, { title: '正则化（L1/L2）防止过拟合', type: 'doc' }, { title: '偏差-方差权衡', type: 'video' }],
    [{ title: '线性回归手写实现', type: 'code' }, { title: '逻辑回归分类练习', type: 'exercise' }, { title: '正则化效果对比实验', type: 'exercise' }],
    [{ title: '监督学习综合测评', type: 'exercise' }, { title: '模型评估指标（Precision/Recall/F1）', type: 'exercise' }],
    [{ title: '核方法与非线性扩展', type: 'doc' }, { title: '半监督学习入门', type: 'video' }, { title: '主动学习策略', type: 'doc' }],
  ],
  ml2: [
    [{ title: '无监督学习应用场景概述', type: 'doc' }, { title: 'K-Means 聚类算法原理', type: 'video' }, { title: '降维的意义与方法概览', type: 'doc' }],
    [{ title: 'DBSCAN 与密度聚类', type: 'video' }, { title: 'PCA 降维数学原理', type: 'doc' }, { title: 't-SNE 可视化直觉', type: 'video' }],
    [{ title: 'K-Means 手写实现', type: 'code' }, { title: '聚类效果评估（轮廓系数）', type: 'exercise' }, { title: 'PCA 降维实战', type: 'exercise' }],
    [{ title: '无监督学习综合测评', type: 'exercise' }, { title: '聚类在客户分群中的应用', type: 'exercise' }],
    [{ title: '自编码器与表示学习', type: 'doc' }, { title: '对比学习入门', type: 'video' }, { title: '无监督特征学习前沿', type: 'doc' }],
  ],
  ml3: [
    [{ title: '决策树分裂原理（信息增益）', type: 'doc' }, { title: 'ID3/C4.5/CART 算法对比', type: 'video' }, { title: '随机森林的 Bagging 思想', type: 'doc' }],
    [{ title: '特征重要性排序机制', type: 'video' }, { title: 'OOB 评估与交叉验证', type: 'doc' }, { title: '树模型的过拟合与剪枝', type: 'video' }],
    [{ title: '决策树手写（贪心分裂）', type: 'code' }, { title: 'sklearn 随机森林调参练习', type: 'exercise' }, { title: '特征重要性可视化', type: 'exercise' }],
    [{ title: '树模型综合测评', type: 'exercise' }, { title: '随机森林在表格数据中的优势', type: 'exercise' }],
    [{ title: '梯度提升树（GBDT）原理', type: 'doc' }, { title: 'XGBoost/LightGBM 对比', type: 'video' }, { title: '树模型在竞赛中的应用', type: 'doc' }],
  ],
  ml4: [
    [{ title: '最大间隔分类器直觉', type: 'doc' }, { title: '支持向量的定义与作用', type: 'video' }, { title: '软间隔与松弛变量', type: 'doc' }],
    [{ title: '核技巧（RBF/多项式核）', type: 'video' }, { title: 'SVM 对偶问题推导', type: 'doc' }, { title: 'SVM 与逻辑回归的对比', type: 'video' }],
    [{ title: 'sklearn SVM 分类实战', type: 'code' }, { title: '核函数选择实验', type: 'exercise' }, { title: 'SVM 调参（C/gamma）练习', type: 'exercise' }],
    [{ title: 'SVM 综合测评', type: 'exercise' }, { title: 'SVM 在文本分类中的应用', type: 'exercise' }],
    [{ title: 'SVM 回归（SVR）', type: 'doc' }, { title: '大规模 SVM 的近似方法', type: 'video' }, { title: 'SVM 在小样本场景的优势', type: 'doc' }],
  ],
  ml5: [
    [{ title: '集成学习核心思想（三个臭皮匠）', type: 'doc' }, { title: 'Bagging vs Boosting 对比', type: 'video' }, { title: '偏差-方差分解与集成的关系', type: 'doc' }],
    [{ title: 'AdaBoost 算法详解', type: 'video' }, { title: 'Stacking 混合策略', type: 'doc' }, { title: 'Blending 与多层集成', type: 'video' }],
    [{ title: '实现简单 Bagging 分类器', type: 'code' }, { title: '集成策略对比实验', type: 'exercise' }, { title: 'Kaggle 竞赛中的集成技巧', type: 'exercise' }],
    [{ title: '集成学习综合测评', type: 'exercise' }, { title: '模型融合对精度的提升量化', type: 'exercise' }],
    [{ title: '深度集成（Snapshot Ensemble）', type: 'doc' }, { title: '多模态集成学习', type: 'video' }, { title: '集成在生产环境中的部署', type: 'doc' }],
  ],

  // ━━━━━━━━━ 深度学习 ━━━━━━━━━
  dl1: [
    [{ title: '感知机模型与激活函数', type: 'doc' }, { title: '多层网络结构与前向传播', type: 'video' }, { title: '万能近似定理', type: 'doc' }],
    [{ title: '反向传播算法推导', type: 'video' }, { title: '梯度消失/爆炸问题', type: 'doc' }, { title: '权重初始化策略', type: 'video' }],
    [{ title: '用 NumPy 手写两层网络', type: 'code' }, { title: '激活函数对比实验', type: 'exercise' }, { title: 'MNIST 手写数字识别', type: 'code' }],
    [{ title: '神经网络基础测评', type: 'exercise' }, { title: '网络深度vs宽度对性能的影响', type: 'exercise' }],
    [{ title: '残差连接与深层网络', type: 'doc' }, { title: '网络架构搜索（NAS）入门', type: 'video' }, { title: '神经网络可解释性', type: 'doc' }],
  ],
  dl2: [
    [{ title: '卷积操作的直觉理解', type: 'doc' }, { title: '卷积核/滤波器的工作原理', type: 'video' }, { title: '池化层的作用', type: 'doc' }],
    [{ title: '经典架构 LeNet→AlexNet→VGG', type: 'video' }, { title: 'ResNet 残差学习原理', type: 'doc' }, { title: '感受野计算方法', type: 'video' }],
    [{ title: '用 PyTorch 搭建 CNN', type: 'code' }, { title: 'CIFAR-10 图像分类实战', type: 'code' }, { title: '卷积核可视化实验', type: 'exercise' }],
    [{ title: 'CNN 综合测评', type: 'exercise' }, { title: '数据增强对分类精度的影响', type: 'exercise' }],
    [{ title: '目标检测（YOLO/Faster RCNN）', type: 'doc' }, { title: '语义分割入门', type: 'video' }, { title: 'Vision Transformer（ViT）', type: 'doc' }],
  ],
  dl3: [
    [{ title: '序列数据与时间步概念', type: 'doc' }, { title: 'RNN 基本结构与隐藏状态', type: 'video' }, { title: '梯度截断解决长期依赖', type: 'doc' }],
    [{ title: 'LSTM 门控机制详解', type: 'video' }, { title: 'GRU 简化门控设计', type: 'doc' }, { title: '双向 RNN 与深层 RNN', type: 'video' }],
    [{ title: '用 LSTM 做文本生成', type: 'code' }, { title: '时间序列预测练习', type: 'exercise' }, { title: 'RNN vs 全连接网络对比', type: 'exercise' }],
    [{ title: '序列模型综合测评', type: 'exercise' }, { title: 'Seq2Seq 在机器翻译中的应用', type: 'exercise' }],
    [{ title: 'Transformer 为何取代 RNN', type: 'doc' }, { title: 'State Space Models 入门', type: 'video' }, { title: '序列建模的未来方向', type: 'doc' }],
  ],
  dl4: [
    [{ title: 'Attention Is All You Need 论文精读', type: 'doc' }, { title: '自注意力机制计算过程', type: 'video' }, { title: 'Multi-Head Attention 原理', type: 'doc' }],
    [{ title: '位置编码（正弦/旋转）详解', type: 'video' }, { title: 'Encoder-Decoder 架构设计', type: 'doc' }, { title: 'Layer Norm 与残差连接', type: 'video' }],
    [{ title: '从零手写 Self-Attention', type: 'code' }, { title: 'Transformer 分类任务实战', type: 'code' }, { title: '注意力权重可视化', type: 'exercise' }],
    [{ title: 'Transformer 架构综合测评', type: 'exercise' }, { title: 'Transformer 复杂度分析', type: 'exercise' }],
    [{ title: 'GPT 系列架构演进', type: 'doc' }, { title: 'Flash Attention 加速原理', type: 'video' }, { title: 'Mamba 与线性注意力', type: 'doc' }],
  ],
  dl5: [
    [{ title: '注意力机制的历史演进', type: 'doc' }, { title: 'Bahdanau Attention 原理', type: 'video' }, { title: 'Self-Attention vs Cross-Attention', type: 'doc' }],
    [{ title: '注意力分数计算（点积/加性）', type: 'video' }, { title: '注意力权重的可解释性', type: 'doc' }, { title: '稀疏注意力与高效注意力', type: 'video' }],
    [{ title: '注意力权重热力图绘制', type: 'code' }, { title: '注意力在不同任务中的表现', type: 'exercise' }, { title: '注意力机制变体对比', type: 'exercise' }],
    [{ title: 'Attention 机制综合测评', type: 'exercise' }, { title: '注意力在 CV/NLP 中的跨领域应用', type: 'exercise' }],
    [{ title: '线性注意力与高效 Transformer', type: 'doc' }, { title: '注意力蒸馏技术', type: 'video' }, { title: '可解释 AI 中的注意力分析', type: 'doc' }],
  ],

  // ━━━━━━━━━ 算法与数据结构 ━━━━━━━━━
  a1: [
    [{ title: '比较排序复杂度下界', type: 'doc' }, { title: '快速排序分治原理', type: 'video' }, { title: '归并排序稳定性分析', type: 'doc' }],
    [{ title: '堆排序与优先队列', type: 'video' }, { title: '二分查找变体（左/右边界）', type: 'doc' }, { title: '排序算法选择决策树', type: 'video' }],
    [{ title: '手写快排/归并/堆排', type: 'code' }, { title: '二分查找边界题练习', type: 'exercise' }, { title: '排序稳定性验证实验', type: 'exercise' }],
    [{ title: '排序与查找综合测评', type: 'exercise' }, { title: 'O(nlogn) 在大数据中的意义', type: 'exercise' }],
    [{ title: '非比较排序（计数/桶/基数）', type: 'doc' }, { title: '外部排序与磁盘排序', type: 'video' }, { title: '排序在数据库索引中的角色', type: 'doc' }],
  ],
  a2: [
    [{ title: '数组vs链表内存模型对比', type: 'doc' }, { title: '栈的应用（括号匹配/表达式求值）', type: 'video' }, { title: '队列与滑动窗口', type: 'doc' }],
    [{ title: '哈希表冲突解决（链地址/开放寻址）', type: 'video' }, { title: '红黑树/AVL 树平衡原理', type: 'doc' }, { title: 'B 树/B+ 树在数据库中的应用', type: 'video' }],
    [{ title: '实现 LRU 缓存（哈希+双向链表）', type: 'code' }, { title: '二叉搜索树操作练习', type: 'exercise' }, { title: '堆的建堆与调整操作', type: 'exercise' }],
    [{ title: '数据结构综合测评', type: 'exercise' }, { title: '不同场景下数据结构选型', type: 'exercise' }],
    [{ title: '跳表与概率数据结构', type: 'doc' }, { title: '布隆过滤器原理与应用', type: 'video' }, { title: '一致性哈希在分布式系统中的角色', type: 'doc' }],
  ],
  a3: [
    [{ title: '图的表示（邻接矩阵/邻接表）', type: 'doc' }, { title: 'BFS 广度优先遍历原理', type: 'video' }, { title: 'DFS 深度优先与回溯', type: 'doc' }],
    [{ title: 'Dijkstra 最短路径算法', type: 'video' }, { title: '拓扑排序与任务调度', type: 'doc' }, { title: '最小生成树（Prim/Kruskal）', type: 'video' }],
    [{ title: '用 BFS 求最短路径', type: 'code' }, { title: '拓扑排序应用题', type: 'exercise' }, { title: '图的连通性判断', type: 'exercise' }],
    [{ title: '图算法综合测评', type: 'exercise' }, { title: '图在社交网络分析中的应用', type: 'exercise' }],
    [{ title: 'A* 搜索与启发式算法', type: 'doc' }, { title: '网络流与匹配问题', type: 'video' }, { title: '图神经网络（GNN）入门', type: 'doc' }],
  ],
  a4: [
    [{ title: '动态规划核心思想（最优子结构）', type: 'doc' }, { title: '重叠子问题与记忆化搜索', type: 'video' }, { title: '状态转移方程设计方法', type: 'doc' }],
    [{ title: '背包问题详解（01/完全/多重）', type: 'video' }, { title: 'LCS/LIS 经典问题', type: 'doc' }, { title: '区间DP与状态压缩', type: 'video' }],
    [{ title: '手写 01 背包 DP', type: 'code' }, { title: 'LIS 最长递增子序列练习', type: 'exercise' }, { title: '编辑距离问题', type: 'exercise' }],
    [{ title: '动态规划综合测评', type: 'exercise' }, { title: 'DP 在序列比对中的应用', type: 'exercise' }],
    [{ title: '概率DP与马尔可夫决策', type: 'doc' }, { title: '强化学习中的 DP 基础', type: 'video' }, { title: 'DP 优化技巧（单调队列/斜率优化）', type: 'doc' }],
  ],

  // ━━━━━━━━━ 工程实践 ━━━━━━━━━
  e1: [
    [{ title: 'Python 虚拟环境（venv/conda）', type: 'doc' }, { title: 'pip/poetry 包管理最佳实践', type: 'video' }, { title: '项目目录结构规范', type: 'doc' }],
    [{ title: '类型提示（Type Hints）详解', type: 'video' }, { title: '代码规范与 PEP8/linting', type: 'doc' }, { title: 'logging 与调试技巧', type: 'video' }],
    [{ title: '搭建 Python 项目脚手架', type: 'code' }, { title: 'pytest 编写单元测试', type: 'code' }, { title: 'requirements.txt 管理练习', type: 'exercise' }],
    [{ title: 'Python 工程能力测评', type: 'exercise' }, { title: '代码质量审查实践', type: 'exercise' }],
    [{ title: 'Python 性能优化技巧', type: 'doc' }, { title: '异步编程（asyncio）入门', type: 'video' }, { title: 'Python 在 ML 工程中的生态', type: 'doc' }],
  ],
  e2: [
    [{ title: 'Git 基本概念（仓库/分支/提交）', type: 'doc' }, { title: 'Git 工作流（commit/push/pull）', type: 'video' }, { title: '分支管理策略（Git Flow）', type: 'doc' }],
    [{ title: 'merge vs rebase 的选择', type: 'video' }, { title: '冲突解决实操', type: 'doc' }, { title: 'Git bisect 与代码溯源', type: 'video' }],
    [{ title: '创建分支并提交 PR', type: 'code' }, { title: '解决合并冲突练习', type: 'exercise' }, { title: '.gitignore 配置', type: 'exercise' }],
    [{ title: '版本控制综合测评', type: 'exercise' }, { title: '团队协作 Git 工作流考核', type: 'exercise' }],
    [{ title: 'Git Hooks 与 CI/CD 集成', type: 'doc' }, { title: '大型仓库管理策略', type: 'video' }, { title: 'Git 在 MLOps 中的角色', type: 'doc' }],
  ],
  e3: [
    [{ title: '模型序列化（pickle/torchscript）', type: 'doc' }, { title: 'REST API 设计基础', type: 'video' }, { title: 'Flask/FastAPI 服务搭建', type: 'doc' }],
    [{ title: 'Docker 容器化打包模型', type: 'video' }, { title: '模型量化与压缩', type: 'doc' }, { title: 'ONNX 格式转换与推理', type: 'video' }],
    [{ title: '用 FastAPI 部署推理服务', type: 'code' }, { title: 'Dockerfile 编写练习', type: 'code' }, { title: '模型推理基准测试', type: 'exercise' }],
    [{ title: '部署综合测评', type: 'exercise' }, { title: '端到端部署流程考核', type: 'exercise' }],
    [{ title: 'Kubernetes 编排入门', type: 'doc' }, { title: 'A/B 测试与灰度发布', type: 'video' }, { title: 'MLOps 全流程概览', type: 'doc' }],
  ],

  // ━━━━━━━━━ NLP与应用 ━━━━━━━━━
  n1: [
    [{ title: '分布式假设（Harris 假说）', type: 'doc' }, { title: 'Word2Vec（CBOW/Skip-gram）原理', type: 'video' }, { title: '词向量的数学表示', type: 'doc' }],
    [{ title: '词向量相似度计算与类比', type: 'video' }, { title: 'GloVe 全局向量方法', type: 'doc' }, { title: 'FastText 子词嵌入', type: 'video' }],
    [{ title: '用 Gensim 训练词向量', type: 'code' }, { title: '词向量可视化（t-SNE）', type: 'exercise' }, { title: '词类比任务练习', type: 'exercise' }],
    [{ title: '词向量综合测评', type: 'exercise' }, { title: '词向量在下游任务中的迁移', type: 'exercise' }],
    [{ title: '上下文化词向量（ELMo）', type: 'doc' }, { title: '从词向量到句子嵌入', type: 'video' }, { title: '多语言词向量', type: 'doc' }],
  ],
  n2: [
    [{ title: '语言模型基本概念（困惑度）', type: 'doc' }, { title: 'GPT 系列架构演进', type: 'video' }, { title: 'BERT 预训练与微调', type: 'doc' }],
    [{ title: 'In-Context Learning 原理', type: 'video' }, { title: 'Chain-of-Thought 推理', type: 'doc' }, { title: 'LLM 的涌现能力', type: 'video' }],
    [{ title: 'Prompt Engineering 实战', type: 'exercise' }, { title: '用 HuggingFace 调用 LLM', type: 'code' }, { title: 'Few-shot vs Zero-shot 对比实验', type: 'exercise' }],
    [{ title: 'LLM 综合测评', type: 'exercise' }, { title: 'LLM 在不同任务中的表现分析', type: 'exercise' }],
    [{ title: 'MoE（混合专家）架构', type: 'doc' }, { title: '长上下文技术（RoPE/ALiBi）', type: 'video' }, { title: 'LLM 推理加速（KV Cache/投机解码）', type: 'doc' }],
  ],
  n3: [
    [{ title: '全参数微调 vs LoRA 微调', type: 'doc' }, { title: '指令微调（Instruction Tuning）', type: 'video' }, { title: '数据准备与格式规范', type: 'doc' }],
    [{ title: 'RLHF 奖励模型原理', type: 'video' }, { title: 'DPO 直接偏好优化', type: 'doc' }, { title: '对齐税与安全性的权衡', type: 'video' }],
    [{ title: '用 LoRA 微调小模型', type: 'code' }, { title: '构建微调数据集', type: 'exercise' }, { title: '微调效果评估', type: 'exercise' }],
    [{ title: '微调与对齐综合测评', type: 'exercise' }, { title: '微调在垂直领域的应用', type: 'exercise' }],
    [{ title: '宪法 AI（Constitutional AI）', type: 'doc' }, { title: 'RLAIF 替代人类标注', type: 'video' }, { title: '对齐技术前沿综述', type: 'doc' }],
  ],
  n4: [
    [{ title: 'RAG 基本架构（检索+生成）', type: 'doc' }, { title: '向量数据库原理（FAISS/Milvus）', type: 'video' }, { title: '文档分块与嵌入策略', type: 'doc' }],
    [{ title: '混合检索（BM25+向量）', type: 'video' }, { title: '重排序（Reranking）优化', type: 'doc' }, { title: '检索质量评估指标', type: 'video' }],
    [{ title: '用 LangChain 搭建 RAG', type: 'code' }, { title: '文档嵌入与检索实验', type: 'code' }, { title: 'RAG vs 长上下文对比', type: 'exercise' }],
    [{ title: 'RAG 综合测评', type: 'exercise' }, { title: 'RAG 在企业知识库中的应用', type: 'exercise' }],
    [{ title: 'GraphRAG 图增强检索', type: 'doc' }, { title: 'Self-RAG 自检索机制', type: 'video' }, { title: '多模态 RAG 入门', type: 'doc' }],
  ],
}

// ============================================================
//  幻灯片生成器
// ============================================================

const TYPE_LABEL: Record<string, string> = { doc: '文档', video: '视频', exercise: '习题', code: '代码' }
const TYPE_ICON: Record<string, string> = { doc: '📖', video: '🎬', exercise: '✏️', code: '💻' }

/**
 * 根据资源信息生成 PPT 幻灯片内容
 * 每个资源 4 页幻灯片：概述 → 核心要点 → 深入讲解 → 总结与练习
 */
function generateSlides(
  title: string,
  type: string,
  domainName: string,
  topicLabel: string,
  stageLabel: string,
): Slide[] {
  const icon = TYPE_ICON[type] || '📖'

  // 第1页：概述
  const slide1: Slide = {
    title,
    subtitle: `${domainName} · ${topicLabel} · ${stageLabel}`,
    icon,
    content: [
      `本节属于「${domainName}」领域中「${topicLabel}」知识点的${stageLabel}环节。`,
      `资源类型：${TYPE_LABEL[type] || type}`,
      `学习目标：理解 ${title} 的核心概念与应用场景`,
      `建议用时：${type === 'code' ? '30' : type === 'exercise' ? '20' : '15'} 分钟`,
    ].join('\n'),
    keyPoints: [
      `${domainName}是AI/ML的基础支柱`,
      `「${topicLabel}」在实际项目中频繁使用`,
      `${stageLabel}阶段侧重${stageLabel === '课前预习' ? '概念理解' : stageLabel === '课中答疑' ? '疑问解答' : stageLabel === '课后巩固' ? '动手实践' : stageLabel === '阶段测评' ? '综合检验' : '拓展提升'}`,
    ],
  }

  // 第2页：核心要点
  const slide2: Slide = {
    title: '核心要点',
    subtitle: `${title}的关键知识`,
    icon: '🎯',
    content: [
      `• ${title}的基本定义与数学表达`,
      `• 常见的实现方式与工具库`,
      `• 在${topicLabel}体系中的位置与作用`,
      `• 与其他知识点的关联关系`,
      `• 实际工程中的最佳实践`,
    ].join('\n'),
    keyPoints: [
      `掌握基本概念是第一步`,
      `动手实践加深理解`,
      `关注工程应用场景`,
    ],
    tip: `学习提示：建议先通读全部要点，再选择性深入感兴趣的部分。`,
  }

  // 第3页：深入讲解
  const slide3Content: Record<string, { content: string; example?: string; tip?: string }> = {
    doc: {
      content: [
        `**理论基础**`,
        `• ${title}的核心原理`,
        `• 数学推导与直觉理解`,
        `- 关键公式与定理`,
        `- 几何/代数视角的解读`,
        ``,
        `**应用场景**`,
        `• 在${domainName}中的典型用法`,
        `• 工业界的实际案例`,
        `• 与前沿研究的联系`,
      ].join('\n'),
      tip: `深度阅读建议：遇到不理解的公式，先跳过继续往后看，往往后面的直觉解释会帮助理解前面的推导。`,
    },
    video: {
      content: [
        `**视频讲解要点**`,
        `• ${title}的直观演示`,
        `• 动态可视化帮助理解`,
        `- 关键步骤的慢放与标注`,
        `- 常见误区的纠正`,
        ``,
        `**观看建议**`,
        `• 带着问题观看效果更佳`,
        `• 暂停思考每个关键步骤`,
      ].join('\n'),
      tip: `观看视频时建议准备好纸笔，随时记录关键概念和自己的疑问。`,
    },
    exercise: {
      content: [
        `**练习目标**`,
        `• 通过实践巩固 ${title} 的理解`,
        `• 培养独立解题的能力`,
        `- 从简单到复杂循序渐进`,
        `- 注重解题思路而非答案`,
        ``,
        `**练习方法**`,
        `• 先独立思考再看参考答案`,
        `• 总结每道题的知识点覆盖`,
      ].join('\n'),
      example: `// 解题框架\n// 1. 审题：明确已知条件和求解目标\n// 2. 建模：将问题转化为数学/编程模型\n// 3. 求解：选择合适的方法求解\n// 4. 验证：检查答案的合理性`,
      tip: `遇到困难时，回顾相关概念的定义和性质，往往能找到突破口。`,
    },
    code: {
      content: [
        `**编程实践**`,
        `• 用代码实现 ${title} 的核心算法`,
        `• 理解每一步的计算过程`,
        `- 输入输出格式设计`,
        `- 时间/空间复杂度分析`,
        ``,
        `**实践要求**`,
        `• 代码风格规范，注释清晰`,
        `• 编写测试用例验证正确性`,
      ].join('\n'),
      example: `# ${title} 实践框架\nimport numpy as np\n\ndef solve():\n    # Step 1: 准备数据\n    # Step 2: 核心算法实现\n    # Step 3: 结果验证\n    pass`,
      tip: `编程练习的关键是"先想清楚再写代码"，伪代码阶段想清楚逻辑能大幅减少调试时间。`,
    },
  }

  const slide3Data = slide3Content[type] || slide3Content.doc
  const slide3: Slide = {
    title: '深入讲解',
    subtitle: `${title}的详细内容`,
    icon: '🔍',
    content: slide3Data.content,
    example: slide3Data.example,
    tip: slide3Data.tip,
    keyPoints: [
      `理论与实践相结合`,
      `注重理解而非死记硬背`,
      `多角度思考问题`,
    ],
  }

  // 第4页：总结
  const slide4: Slide = {
    title: '总结与下一步',
    subtitle: `回顾与展望`,
    icon: '🚀',
    content: [
      `**本节回顾**`,
      `• 学习了 ${title} 的核心概念`,
      `• 掌握了${TYPE_LABEL[type] || type}类型的学习方法`,
      `• 理解了在${topicLabel}中的应用`,
      ``,
      `**下一步建议**`,
      `• 完成配套练习巩固知识`,
      `• 查阅参考资料深入学习`,
      `• 关注${topicLabel}的最新进展`,
    ].join('\n'),
    keyPoints: [
      `知识需要反复巩固`,
      `实践是最好的学习方式`,
      `保持持续学习的习惯`,
    ],
    tip: `完成本节后，可以在学习路径页面查看下一阶段的学习内容。`,
  }

  return [slide1, slide2, slide3, slide4]
}

// ============================================================
//  资源标题 → B站 BV号 映射（逐个搜索得到）
// ============================================================

const TITLE_BVID_MAP: Record<string, string> = {
  // ━━━━━━━━━ 数学基础 · 矩阵运算 ━━━━━━━━━
  '矩阵加减乘与转置概念': 'BV1Wy4y1h7ii',
  'NumPy 矩阵创建与基本操作': 'BV1Fr4y1L7ZK',
  '线性方程组与矩阵关系': 'BV1PXohBqEyt',
  '矩阵乘法结合律常见疑问': 'BV1Wd4y1u7eW',
  '逆矩阵与行列式的直觉理解': 'BV1aEVUzrEZZ',
  '分块矩阵运算技巧': 'BV1YB4y1p7eU',
  '矩阵乘法手算练习': 'BV1cX4y1s7W3',
  'NumPy 矩阵运算编程题': 'BV18a411B771',
  '特殊矩阵（对角/对称/稀疏）辨识': 'BV1WM411A7YQ',
  '矩阵运算综合测试': 'BV1dm4y1q76a',
  '矩阵在图像变换中的应用': 'BV15R4y1374g',
  'SVD 分解原理与应用': 'BV1XcfiBeEwQ',
  'PCA 降维中的矩阵运算': 'BV1hoMwzhERC',
  '矩阵分解在推荐系统中的角色': 'BV1bg411X7ea',
  // ━━━━━━━━━ 数学基础 · 特征值与分解 ━━━━━━━━━
  '特征值与特征向量的几何含义': 'BV1gP411Y7a9',
  '特征方程求解方法': 'BV1rB4y167pT',
  '对角化条件与步骤': 'BV1Ep4y1S7js',
  '特征值在 PCA 中的作用': 'BV1n84y1u7ha',
  '实对称矩阵的谱定理': 'BV1Wg411H7Ep',
  '特征值与矩阵稳定性的关系': 'BV1ahUaBwECn',
  '手动计算 2x2 矩阵特征值': 'BV1Rv4y1P7db',
  '用 sklearn 求协方差矩阵特征值': 'BV1Sm4y1n7jb',
  '特征值分解验证练习': 'BV1H64y1T7zQ',
  '特征值综合测验': 'BV1FK411D75p',
  '特征值在 PageRank 中的应用': 'BV1WixqeNEQN',
  '特征值在动力系统中的意义': 'BV1E5411E71z',
  '谱聚类算法原理': 'BV1mFo7BvEEj',
  '特征值在量子计算中的角色': 'BV1N54y1B7SK',
  // ━━━━━━━━━ 数学基础 · 概率论 ━━━━━━━━━
  '随机变量与概率分布基础': 'BV1Zk4y1V7JR',
  '条件概率与贝叶斯公式': 'BV1E34y1x7cL',
  '常见分布（正态/泊松/二项）概览': 'BV1mFo7BvEEj',
  '贝叶斯推理在垃圾邮件过滤中的应用': 'BV1Je4y1t7H5',
  '联合分布与边缘分布的关系': 'BV1Pu41167sA',
  '大数定律直觉理解': 'BV1cq4y1C7Dx',
  '概率计算综合练习': 'BV1vZfKYeEii',
  '用 Python 模拟概率实验': 'BV1D64y1z7xW',
  '贝叶斯公式应用题': 'BV1Hb9XBQEhW',
  '概率论阶段测评': 'BV1FmNeeqEUY',
  '概率在 ML 损失函数中的角色': 'BV17w4m1C7VT',
  '概率图模型入门': 'BV1YF411u78K',
  '蒙特卡洛方法原理': 'BV1Jo4y1D7uR',
  '概率论在自然语言处理中的应用': 'BV1o5kqYjER2',
  // ━━━━━━━━━ 数学基础 · 微积分 ━━━━━━━━━
  '导数的定义与几何意义': 'BV1f7411S75E',
  '常见函数求导公式速查': 'BV1mb411G7sD',
  '偏导数与梯度概念': 'BV1Ff4y1d7i7',
  '链式法则在反向传播中的应用': 'BV1mA4m1P7AF',
  '梯度下降法的数学推导': 'BV1eT4y1B76T',
  '多元函数极值条件': 'BV1PA54zTEkk',
  '手算导数练习题': 'BV1CQr3BrEZx',
  '梯度下降手动模拟': 'BV1Tw411G7CX',
  'PyTorch 自动求导体验': 'BV1TR4y1c7ns',
  '微积分基础测验': 'BV1Js4y1372V',
  '导数在优化算法中的核心角色': 'BV12c411y74S',
  '积分在概率密度中的应用': 'BV1dUiGeLEBs',
  '变分法入门': 'BV1TmSuYiE3t',
  '微积分在深度学习优化中的前沿': 'BV1wz421y7Nj',
  // ━━━━━━━━━ 数学基础 · 凸优化 ━━━━━━━━━
  '凸集与凸函数定义': 'BV1XR4y1x7aJ',
  '优化问题分类（无约束/有约束）': 'BV1x64y1M7iU',
  '局部最优与全局最优的区别': 'BV11W411T7vq',
  '拉格朗日乘子法原理': 'BV15T411f7DY',
  'SVM 中的凸优化应用': 'BV16T4y1y7qj',
  'KKT 条件直觉理解': 'BV1HP4y1Y79e',
  '凸函数判定练习': 'BV1bu4y197ML',
  '用 cvxpy 解简单优化问题': 'BV1S1NJerEft',
  '约束优化手算题': 'BV1ZAkuB8ERB',
  '凸优化综合测评': 'BV1gP4y1e7ZP',
  '优化在模型训练中的实际意义': 'BV1y4421w7c3',
  '非凸优化与鞍点问题': 'BV1P94y1S7Xn',
  '学习率调度策略': 'BV1Vd4y1p7eP',
  '二阶优化方法（牛顿法）简介': 'BV1H57i6nE4w',
  // ━━━━━━━━━ 机器学习 · 监督学习 ━━━━━━━━━
  '监督学习基本框架（输入→标签）': 'BV1fQ4y1X7xG',
  '线性回归原理与公式推导': 'BV16Q4y1b7mD',
  '逻辑回归与 sigmoid 函数': 'BV1wi4y157Tt',
  '损失函数（MSE/CrossEntropy）详解': 'BV1WC36zvEoT',
  '正则化（L1/L2）防止过拟合': 'BV1Wy4y1y7rc',
  '偏差-方差权衡': 'BV18r4y1M71J',
  '线性回归手写实现': 'BV1vt4y117Zz',
  '逻辑回归分类练习': 'BV14e4y1j77k',
  '正则化效果对比实验': 'BV1pW4y197Jn',
  '监督学习综合测评': 'BV1PJ411676g',
  '模型评估指标（Precision/Recall/F1）': 'BV1y34y147xN',
  '核方法与非线性扩展': 'BV1yK411d7TV',
  '半监督学习入门': 'BV1pW4y197Jn',
  '主动学习策略': 'BV16V4y1S7R9',
  // ━━━━━━━━━ 机器学习 · 无监督学习 ━━━━━━━━━
  '无监督学习应用场景概述': 'BV1pW4y197Jn',
  'K-Means 聚类算法原理': 'BV1GPiEBFEte',
  '降维的意义与方法概览': 'BV1Wz421k7Vb',
  'DBSCAN 与密度聚类': 'BV1aA4y1o7UG',
  'PCA 降维数学原理': 'BV1QS4y1e7y6',
  't-SNE 可视化直觉': 'BV1zfXzYnEeb',
  'K-Means 手写实现': 'BV1yD4y147BQ',
  '聚类效果评估（轮廓系数）': 'BV1ubvYedEJA',
  'PCA 降维实战': 'BV18v41147bT',
  '无监督学习综合测评': 'BV1vv4y1j7cr',
  '聚类在客户分群中的应用': 'BV1kY4y177RT',
  '自编码器与表示学习': 'BV1uf4y1A7KC',
  '对比学习入门': 'BV1JtEqzeEkJ',
  '无监督特征学习前沿': 'BV1wJ411o72g',
  // ━━━━━━━━━ 机器学习 · 决策树/随机森林 ━━━━━━━━━
  '决策树分裂原理（信息增益）': 'BV1JtEqzeEkJ',
  'ID3/C4.5/CART 算法对比': 'BV1m741187N6',
  '随机森林的 Bagging 思想': 'BV1x7411t7ui',
  '特征重要性排序机制': 'BV1oCW3e1EQD',
  'OOB 评估与交叉验证': 'BV1ii421f79L',
  '树模型的过拟合与剪枝': 'BV1SdfnYwERM',
  '决策树手写（贪心分裂）': 'BV1DG411m7SJ',
  'sklearn 随机森林调参练习': 'BV14z4y1L7MZ',
  '特征重要性可视化': 'BV1oCW3e1EQD',
  '树模型综合测评': 'BV1wR9eYkEZj',
  '随机森林在表格数据中的优势': 'BV1xF411Z7bS',
  '梯度提升树（GBDT）原理': 'BV1QdQJBTEGV',
  'XGBoost/LightGBM 对比': 'BV16T4y1y7qj',
  '树模型在竞赛中的应用': 'BV1DCVp6EEV',
  // ━━━━━━━━━ 机器学习 · SVM ━━━━━━━━━
  '最大间隔分类器直觉': 'BV1K5411g7nB',
  '支持向量的定义与作用': 'BV1xV411k7Ke',
  '软间隔与松弛变量': 'BV1AS4y1K7Jf',
  '核技巧（RBF/多项式核）': 'BV1za41187aJ',
  'SVM 对偶问题推导': 'BV1SM411W7TH',
  'SVM 与逻辑回归的对比': 'BV1PJ411676g',
  'sklearn SVM 分类实战': 'BV1Er3FzyEGW',
  '核函数选择实验': 'BV1zY1vB2E9u',
  'SVM 调参（C/gamma）练习': 'BV1js4y1z7eU',
  'SVM 综合测评': 'BV16T4y1y7qj',
  'SVM 在文本分类中的应用': 'BV18pEmzmE4n',
  'SVM 回归（SVR）': 'BV1GZ4y1R7yM',
  '大规模 SVM 的近似方法': 'BV1uU4y1g76R',
  'SVM 在小样本场景的优势': 'BV1gEWeeAE5U',
  // ━━━━━━━━━ 机器学习 · 集成学习 ━━━━━━━━━
  '集成学习核心思想（三个臭皮匠）': 'BV19DX7YjEWb',
  'Bagging vs Boosting 对比': 'BV19N411f7rG',
  '偏差-方差分解与集成的关系': 'BV1Q9QuYEEXP',
  'AdaBoost 算法详解': 'BV14Y41177VW',
  'Stacking 混合策略': 'BV1Hf4y1i7xv',
  'Blending 与多层集成': 'BV183411n7Ys',
  '实现简单 Bagging 分类器': 'BV1n5411D7vm',
  '集成策略对比实验': 'BV1iu4y1t7wF',
  'Kaggle 竞赛中的集成技巧': 'BV1fk84zYEqQ',
  '集成学习综合测评': 'BV19KzEBBEeV',
  '模型融合对精度的提升量化': 'BV1s5411D7M7',
  '深度集成（Snapshot Ensemble）': 'BV1XQW3egESZ',
  '多模态集成学习': 'BV1cY411s74b',
  '集成在生产环境中的部署': 'BV1ujQuYyEoC',
  // ━━━━━━━━━ 深度学习 · 神经网络 ━━━━━━━━━
  '感知机模型与激活函数': 'BV1H44y1y7JK',
  '多层网络结构与前向传播': 'BV1QAjmzCEgx',
  '万能近似定理': 'BV1qX4y1E73J',
  '反向传播算法推导': 'BV1QV4y1E7eA',
  '梯度消失/爆炸问题': 'BV1KL79z9E97',
  '权重初始化策略': 'BV1yGSFYBEfF',
  '用 NumPy 手写两层网络': 'BV1GC4y15736',
  '激活函数对比实验': 'BV1qL411o7av',
  'MNIST 手写数字识别': 'BV1HN786AESo',
  '神经网络基础测评': 'BV1xjg9zqEem',
  '网络深度vs宽度对性能的影响': 'BV1gqRjBeEuQ',
  '残差连接与深层网络': 'BV1x44y1P7s2',
  '网络架构搜索（NAS）入门': 'BV1mw4m1a7Xu',
  '神经网络可解释性': 'BV1t44y1r7ct',
  // ━━━━━━━━━ 深度学习 · CNN ━━━━━━━━━
  '卷积操作的直觉理解': 'BV1cs411W74f',
  '卷积核/滤波器的工作原理': 'BV1Q5411d7hz',
  '池化层的作用': 'BV1ZK421x7SC',
  '经典架构 LeNet→AlexNet→VGG': 'BV1ZQeZzaEGU',
  'ResNet 残差学习原理': 'BV1WUUaBSEzx',
  '感受野计算方法': 'BV1mw4m1a7Xu',
  '用 PyTorch 搭建 CNN': 'BV1dT411z7mm',
  'CIFAR-10 图像分类实战': 'BV1tg411b7fn',
  '卷积核可视化实验': 'BV1QAjmzCEgx',
  'CNN 综合测评': 'BV1QV4y1E7eA',
  '数据增强对分类精度的影响': 'BV11Zjo6mEoZ',
  '目标检测（YOLO/Faster RCNN）': 'BV1GD6UYvErA',
  '语义分割入门': 'BV1yG411x7Cc',
  'Vision Transformer（ViT）': 'BV1JQgWeQE6J',
  // ━━━━━━━━━ 深度学习 · RNN/LSTM ━━━━━━━━━
  '序列数据与时间步概念': 'BV1trD5BEEXy',
  'RNN 基本结构与隐藏状态': 'BV1Bx4YeEEEU',
  '梯度截断解决长期依赖': 'BV1JBDmB8EdT',
  'LSTM 门控机制详解': 'BV1Bq4y1Y7GC',
  'GRU 简化门控设计': 'BV1cr1KYuEsp',
  '双向 RNN 与深层 RNN': 'BV1sU4y1S7kc',
  '用 LSTM 做文本生成': 'BV1dEJH6uEYs',
  '时间序列预测练习': 'BV19u4m1T7JR',
  'RNN vs 全连接网络对比': 'BV1696PY9Ex6',
  '序列模型综合测评': 'BV1bM411T7J3',
  'Seq2Seq 在机器翻译中的应用': 'BV1au4y1P7uL',
  'Transformer 为何取代 RNN': 'BV1dr4y1F7tw',
  'State Space Models 入门': 'BV1y3411k7eM',
  '序列建模的未来方向': 'BV1jXrBYjELP',
  // ━━━━━━━━━ 深度学习 · Transformer ━━━━━━━━━
  'Attention Is All You Need 论文精读': 'BV1WG411K7fC',
  '自注意力机制计算过程': 'BV1Rz4y1g7J7',
  'Multi-Head Attention 原理': 'BV1FjrCBdESo',
  '位置编码（正弦/旋转）详解': 'BV15v411W78M',
  'Encoder-Decoder 架构设计': 'BV1wq4y1C7xh',
  'Layer Norm 与残差连接': 'BV19YbFeHETz',
  '从零手写 Self-Attention': 'BV15aqYYDE9o',
  'Transformer 分类任务实战': 'BV1ZJ4m1K73s',
  '注意力权重可视化': 'BV1j841197rQ',
  'Transformer 架构综合测评': 'BV177421f7H5',
  'Transformer 复杂度分析': 'BV1Pt4y197VZ',
  'GPT 系列架构演进': 'BV1ihjR6tEad',
  'Flash Attention 加速原理': 'BV1UT421k7rA',
  'Mamba 与线性注意力': 'BV1G2421c7vL',
  // ━━━━━━━━━ 深度学习 · Attention ━━━━━━━━━
  '注意力机制的历史演进': 'BV16f1mB7Ebj',
  'Bahdanau Attention 原理': 'BV1wq4y1C7xh',
  'Self-Attention vs Cross-Attention': 'BV1ni4y1X7JQ',
  '注意力分数计算（点积/加性）': 'BV1d5SCBiEAP',
  '注意力权重的可解释性': 'BV1BbeozbETZ',
  '稀疏注意力与高效注意力': 'BV1ie411F78J',
  '注意力权重热力图绘制': 'BV1B341127NK',
  '注意力在不同任务中的表现': 'BV1wZ421T7vf',
  '注意力机制变体对比': 'BV1of421Z7mF',
  'Attention 机制综合测评': 'BV1Rz4y1g7J7',
  '注意力在 CV/NLP 中的跨领域应用': 'BV1hwwwz2EUk',
  '线性注意力与高效 Transformer': 'BV1BbeozbETZ',
  '注意力蒸馏技术': 'BV1ts421M73Y',
  '可解释 AI 中的注意力分析': 'BV1yJ4m1J7ks',
  // ━━━━━━━━━ 算法 · 排序与查找 ━━━━━━━━━
  '比较排序复杂度下界': 'BV1Lm411d7qu',
  '快速排序分治原理': 'BV1aZ421x7P1',
  '归并排序稳定性分析': 'BV1mk2kB2Eqw',
  '堆排序与优先队列': 'BV1AF411G7cA',
  '二分查找变体（左/右边界）': 'BV1GM4y1m7r6',
  '排序算法选择决策树': 'BV1r64y1E7zW',
  '手写快排/归并/堆排': 'BV1Nu4y1n7Hk',
  '二分查找边界题练习': 'BV1U64y1f7zg',
  '排序稳定性验证实验': 'BV16f1mB7Ebj',
  '排序与查找综合测评': 'BV1B341127NK',
  'O(nlogn) 在大数据中的意义': 'BV1wZ421T7vf',
  '非比较排序（计数/桶/基数）': 'BV1ze4y1D7VZ',
  '外部排序与磁盘排序': 'BV17x8jzvEm6',
  '排序在数据库索引中的角色': 'BV15kjw6gEGp',
  // ━━━━━━━━━ 算法 · 数据结构 ━━━━━━━━━
  '数组vs链表内存模型对比': 'BV1UC4y1T7Lq',
  '栈的应用（括号匹配/表达式求值）': 'BV1uxCzYrEvK',
  '队列与滑动窗口': 'BV15t421c7Xj',
  '哈希表冲突解决（链地址/开放寻址）': 'BV1cg411c7Rh',
  '红黑树/AVL 树平衡原理': 'BV1tZ421q72h',
  'B 树/B+ 树在数据库中的应用': 'BV1wg4y1r7hc',
  '实现 LRU 缓存（哈希+双向链表）': 'BV15Y4y1574Q',
  '二叉搜索树操作练习': 'BV13SBYBkEA3',
  '堆的建堆与调整操作': 'BV1jh41187Qq',
  '数据结构综合测评': 'BV1veABzsEe9',
  '不同场景下数据结构选型': 'BV1jYC6YRExe',
  '跳表与概率数据结构': 'BV1Cdjn6VEEs',
  '布隆过滤器原理与应用': 'BV1rL4y1n7p3',
  '一致性哈希在分布式系统中的角色': 'BV1vD7q6yEKh',
  // ━━━━━━━━━ 算法 · 图算法 ━━━━━━━━━
  '图的表示（邻接矩阵/邻接表）': 'BV1Q9sSejEhB',
  'BFS 广度优先遍历原理': 'BV1VK411t74h',
  'DFS 深度优先与回溯': 'BV1B1QpYwELv',
  'Dijkstra 最短路径算法': 'BV1uT4y1p7Jy',
  '拓扑排序与任务调度': 'BV1XV411X7T7',
  '最小生成树（Prim/Kruskal）': 'BV1RG9vYFEN3',
  '用 BFS 求最短路径': 'BV1wG411z79G',
  '拓扑排序应用题': 'BV1AB4y1w7eT',
  '图的连通性判断': 'BV1r84y1379W',
  '图算法综合测评': 'BV13Q4y197Wg',
  '图在社交网络分析中的应用': 'BV1hF41187bA',
  'A* 搜索与启发式算法': 'BV1zGQ6YmE6J',
  '网络流与匹配问题': 'BV1g7411B7SP',
  '图神经网络（GNN）入门': 'BV16MJg6jEBn',
  // ━━━━━━━━━ 算法 · 动态规划 ━━━━━━━━━
  '动态规划核心思想（最优子结构）': 'BV1LN4y1v7pH',
  '重叠子问题与记忆化搜索': 'BV11V41157Ce',
  '状态转移方程设计方法': 'BV1Qg411Z7Xo',
  '背包问题详解（01/完全/多重）': 'BV1moEq6eEEh',
  'LCS/LIS 经典问题': 'BV1ey4y1d7oD',
  '区间DP与状态压缩': 'BV1Wf4y1R794',
  '手写 01 背包 DP': 'BV1sA411B73r',
  'LIS 最长递增子序列练习': 'BV1qm4y137e4',
  '编辑距离问题': 'BV1ZS4y1r7Gk',
  '动态规划综合测评': 'BV1rG4y1e7qT',
  'DP 在序列比对中的应用': 'BV1Dv411u7GN',
  '概率DP与马尔可夫决策': 'BV1wb4y1C7LG',
  '强化学习中的 DP 基础': 'BV1kny1BrExr',
  'DP 优化技巧（单调队列/斜率优化）': 'BV11XMxzHEb6',
  // ━━━━━━━━━ 工程 · Python工程 ━━━━━━━━━
  'Python 虚拟环境（venv/conda）': 'BV1eM411D7rR',
  'pip/poetry 包管理最佳实践': 'BV1Ye4y1K7yH',
  '项目目录结构规范': 'BV1pL4y1E7RE',
  '类型提示（Type Hints）详解': 'BV156dRY8Ezh',
  '代码规范与 PEP8/linting': 'BV1Tx411Z7A9',
  'logging 与调试技巧': 'BV1cE5QzAE41',
  '搭建 Python 项目脚手架': 'BV1JsLDzAEGu',
  'pytest 编写单元测试': 'BV1KZWKz3Ek5',
  'requirements.txt 管理练习': 'BV17Y4UefEzs',
  'Python 工程能力测评': 'BV1Qp4y1f7Wg',
  '代码质量审查实践': 'BV1NA4m1V7hm',
  'Python 性能优化技巧': 'BV1uT4y1p7Jy',
  '异步编程（asyncio）入门': 'BV1eP4y1Y77a',
  'Python 在 ML 工程中的生态': 'BV1uCH1eoEYP',
  // ━━━━━━━━━ 工程 · 版本控制 ━━━━━━━━━
  'Git 基本概念（仓库/分支/提交）': 'BV1tfuKzzEE6',
  'Git 工作流（commit/push/pull）': 'BV1VG411F7rB',
  '分支管理策略（Git Flow）': 'BV16Y411B7Jp',
  'merge vs rebase 的选择': 'BV1np4y1M7CZ',
  '冲突解决实操': 'BV1K5411M7P7',
  'Git bisect 与代码溯源': 'BV1hv421y76T',
  '创建分支并提交 PR': 'BV16M411z7uH',
  '解决合并冲突练习': 'BV1bm8uzTEma',
  '.gitignore 配置': 'BV1EG4y1Z7WW',
  '版本控制综合测评': 'BV1EuxTe3EB6',
  '团队协作 Git 工作流考核': 'BV1J9ChBfEMT',
  'Git Hooks 与 CI/CD 集成': 'BV1W54y1q7R5',
  '大型仓库管理策略': 'BV17jjDzaEaM',
  'Git 在 MLOps 中的角色': 'BV1Hkr7YYEh8',
  // ━━━━━━━━━ 工程 · 模型部署 ━━━━━━━━━
  '模型序列化（pickle/torchscript）': 'BV1pA411j7eQ',
  'REST API 设计基础': 'BV1BA411c7Sd',
  'Flask/FastAPI 服务搭建': 'BV1p5411X7Zy',
  'Docker 容器化打包模型': 'BV1cM4y187Xc',
  '模型量化与压缩': 'BV11PoTYkEE1',
  'ONNX 格式转换与推理': 'BV1CJ411T7BK',
  '用 FastAPI 部署推理服务': 'BV1AWgeeQEPz',
  'Dockerfile 编写练习': 'BV1FE421u7nH',
  '模型推理基准测试': 'BV1yrkqYZEU7',
  '部署综合测评': 'BV18m411B72m',
  '端到端部署流程考核': 'BV1XB4YegEJv',
  'Kubernetes 编排入门': 'BV1zeozBQEUc',
  'A/B 测试与灰度发布': 'BV1ccH2eLEDe',
  'MLOps 全流程概览': 'BV1Rt41127k8',
  // ━━━━━━━━━ NLP · 词向量 ━━━━━━━━━
  '分布式假设（Harris 假说）': 'BV1SG4zeHEDd',
  'Word2Vec（CBOW/Skip-gram）原理': 'BV1Km41117VG',
  '词向量的数学表示': 'BV1vS4y1N7mo',
  '词向量相似度计算与类比': 'BV1924y1b7Cy',
  'GloVe 全局向量方法': 'BV1Wz421k7Vb',
  'FastText 子词嵌入': 'BV1u5Niz7ENv',
  '用 Gensim 训练词向量': 'BV1PW421N769',
  '词向量可视化（t-SNE）': 'BV1Y3411g7Jq',
  '词类比任务练习': 'BV1Nt4y137iS',
  '词向量综合测评': 'BV1Vt4y1X799',
  '词向量在下游任务中的迁移': 'BV1814y1R71D',
  '上下文化词向量（ELMo）': 'BV1Ps4y167Zv',
  '从词向量到句子嵌入': 'BV1oU4y177Va',
  '多语言词向量': 'BV15t4y187Qi',
  // ━━━━━━━━━ NLP · LLM ━━━━━━━━━
  '语言模型基本概念（困惑度）': 'BV1GJUbYYEGv',
  'BERT 预训练与微调': 'BV1Vt4y1X799',
  'In-Context Learning 原理': 'BV1Y3411g7Jq',
  'Chain-of-Thought 推理': 'BV12QEd6SEUC',
  'LLM 的涌现能力': 'BV1gnMfzpE8M',
  'Prompt Engineering 实战': 'BV1BJ4m1E7RN',
  '用 HuggingFace 调用 LLM': 'BV1hWo1BXEko',
  'Few-shot vs Zero-shot 对比实验': 'BV1Tp42197sy',
  'LLM 综合测评': 'BV18T7k6JEdm',
  'LLM 在不同任务中的表现分析': 'BV1h1NCzuE6i',
  'MoE（混合专家）架构': 'BV1Mr4y1X78K',
  '长上下文技术（RoPE/ALiBi）': 'BV1t2jX6zEQ2',
  'LLM 推理加速（KV Cache/投机解码）': 'BV1wPUDBYErR',
  // ━━━━━━━━━ NLP · 微调与对齐 ━━━━━━━━━
  '全参数微调 vs LoRA 微调': 'BV11zUDBBEFD',
  '指令微调（Instruction Tuning）': 'BV1MpH9e5EVN',
  '数据准备与格式规范': 'BV1GW9KBzEsF',
  'RLHF 奖励模型原理': 'BV1m8FnzpEXm',
  'DPO 直接偏好优化': 'BV1rGZcBjEHg',
  '对齐税与安全性的权衡': 'BV16gxXeTEts',
  '用 LoRA 微调小模型': 'BV1ew7M6REJL',
  '构建微调数据集': 'BV1C24y127wZ',
  '微调效果评估': 'BV1Jg411i7CR',
  '微调与对齐综合测评': 'BV1fC4y1n7Km',
  '微调在垂直领域的应用': 'BV1qJt1z5EyE',
  '宪法 AI（Constitutional AI）': 'BV1Ux5X6KEnm',
  'RLAIF 替代人类标注': 'BV1waZ2YDEcp',
  '对齐技术前沿综述': 'BV12woEYCEug',
  // ━━━━━━━━━ NLP · 检索增强(RAG) ━━━━━━━━━
  'RAG 基本架构（检索+生成）': 'BV1otokBpENn',
  '向量数据库原理（FAISS/Milvus）': 'BV1nx421m7kJ',
  '文档分块与嵌入策略': 'BV11XMxzHEb6',
  '混合检索（BM25+向量）': 'BV1qqpuzbELr',
  '重排序（Reranking）优化': 'BV1kq4y1R7ez',
  '检索质量评估指标': 'BV1Esu3zMETG',
  '用 LangChain 搭建 RAG': 'BV1AjYNzXEZ7',
  '文档嵌入与检索实验': 'BV1Ag411W7SW',
  'RAG vs 长上下文对比': 'BV14GWizWEsT',
  'RAG 综合测评': 'BV1KX9xBHENe',
  'RAG 在企业知识库中的应用': 'BV1oT411k7vn',
  'GraphRAG 图增强检索': 'BV1CDHQzdEfg',
  'Self-RAG 自检索机制': 'BV1Dv411u7GN',
  '多模态 RAG 入门': 'BV1wb4y1C7LG',
}

// ============================================================
//  构建完整资源列表
// ============================================================

let _cachedResources: Resource[] | null = null

export function getAllLearningResources(): Resource[] {
  if (_cachedResources) return _cachedResources

  const resources: Resource[] = []
  let globalIdx = 0

  for (const domain of DOMAINS) {
    for (const topic of domain.topics) {
      const nodeStages = NODE_CONTENT[topic.id]
      if (!nodeStages) continue

      nodeStages.forEach((stageResources, stageIdx) => {
        const stage = STAGES[stageIdx]
        if (!stage) return

        stageResources.forEach((res) => {
          globalIdx++
          const id = `lr-${topic.id}-s${stageIdx}-${globalIdx}`
          const categoryMap: Record<string, Resource['category']> = {
            doc: '文档', video: '视频', exercise: '习题', code: '代码',
          }

          const difficultyMap: Record<number, Resource['difficulty']> = {
            0: '初级', 1: '初级', 2: '中级', 3: '中级', 4: '高级',
          }

          const slides = generateSlides(res.title, res.type, domain.name, topic.label, stage.label)
          // 按资源标题精确匹配 BV 号，找不到则用全局索引兜底
          const bvid = TITLE_BVID_MAP[res.title]

          resources.push({
            id,
            title: res.title,
            category: categoryMap[res.type] || '文档',
            description: `${domain.name} · ${topic.label} · ${stage.label} — ${res.title}`,
            difficulty: difficultyMap[stageIdx] || '中级',
            tags: [domain.short, topic.label, stage.label, TYPE_LABEL[res.type] || res.type],
            date: '2026-06-25',
            views: 100 + Math.floor(Math.random() * 900),
            starred: false,
    author: '智学星枢教研组',
            estimatedTime: res.type === 'code' ? '30分钟' : res.type === 'exercise' ? '20分钟' : '15分钟',
            contentMarkdown: slides.map((s, i) => `## 第${i + 1}页：${s.title}\n\n${s.content}`).join('\n\n---\n\n'),
            slides,
            color: domain.color,
            domain: domain.name,
            topic: topic.label,
            stage: stage.label,
            sourceType: res.type as Resource['sourceType'],
            bilibiliBvid: bvid || undefined,
            bilibiliQuery: `${topic.label} ${res.title}`,
          })
        })
      })
    }
  }

  _cachedResources = resources
  return resources
}
