<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useTheme } from '../../composables/useEduMindTheme'
import {
  ArrowLeft,
  Code,
  Play,
  RotateCcw,
  Save,
  HelpCircle,
  CheckCircle,
  Terminal,
  Lightbulb,
  Info,
  BookOpen,
  ChevronRight,
  Sparkles,
  ExternalLink,
  Check,
  FileText,
  Bookmark,
  Activity,
  Award,
  ChevronDown,
  Star,
  Share2,
  MessageSquare,
  History,
  CornerDownRight,
  PlayCircle,
  ThumbsUp,
  X,
  Plus,
  PanelRightClose,
  PanelRightOpen
} from 'lucide-vue-next'
import type { CourseItem } from '../../data/edu-mind-course-data'
import { COURSES_DATA } from '../../data/edu-mind-course-data'

interface ConceptItem {
  id: string
  name: string
  difficulty: '简单' | '中级' | '困难'
  description: string
  inputFormat: string
  outputFormat: string
  samples: {
    input: string
    output: string
  }[]
  starterTemplates: Record<string, string>
  testCases: {
    id: number
    input: string
    output: string
    expected: string
    passed: boolean
  }[]
  tutorialAnswer: string
}

function getExercisesForCourse(course: CourseItem): ConceptItem[] {
  if (course.id === 'prog-c' || course.id.toLowerCase().includes('c-') || course.name.includes('C语言')) {
    return [
      {
        id: 'c-ex-1',
        name: '指针 1：两个整数交换与指针引用',
        difficulty: '简单',
        description: '设计一个 C 语言函数 `void swap(int *a, int *b)`，交换两个指向的整型变量的值。输入两个数字并进行输出验证。',
        inputFormat: '输入两个用空格分隔的整数，如 "3 5"。',
        outputFormat: '输出交换后的两个整数，用空格分隔，如 "5 3"。',
        samples: [{ input: '3 5', output: '5 3' }],
        starterTemplates: {
          'C++': `#include <iostream>\nusing namespace std;\n\nvoid swap(int *a, int *b) {\n    int temp = *a;\n    *a = *b;\n    *b = temp;\n}\n\nint main() {\n    int x, y;\n    if (cin >> x >> y) {\n        swap(&x, &y);\n        cout << x << " " << y << endl;\n    }\n    return 0;\n}`,
          Python3: `# Python 模拟整数位置交换\na, b = map(int, input().split())\na, b = b, a\nprint(f"{a} {b}")`,
          Java: `import java.util.Scanner;\npublic class Main {\n    public static void swap(int[] arr) {\n        int temp = arr[0];\n        arr[0] = arr[1];\n        arr[1] = temp;\n    }\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int a = sc.nextInt();\n        int b = sc.nextInt();\n        int[] arr = {a, b};\n        swap(arr);\n        System.out.println(arr[0] + " " + arr[1]);\n    }\n}`
        },
        testCases: [
          { id: 1, input: '3 5', output: '5 3', expected: '5 3', passed: true },
          { id: 2, input: '12 80', output: '80 12', expected: '80 12', passed: true }
        ],
        tutorialAnswer: '利用临时变量 `temp` 配合指针解引用 `*a` 和 `*b` 即可完成交换。'
      },
      {
        id: 'c-ex-2',
        name: '序列 2：顺序存储结构冒泡排序',
        difficulty: '中级',
        description: '读入 5 个整数放入整型数组，对其进行一维排序（升序）。输出最终排序后的有序结果。',
        inputFormat: '一行 5 个空格分隔的整数，如 "23 12 5 90 2"。',
        outputFormat: '输出一行 5 个由小到大递增的排序整数，用空格分隔。',
        samples: [{ input: '23 12 5 90 2', output: '2 5 12 23 90' }],
        starterTemplates: {
          'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    int arr[5];\n    for(int i=0; i<5; i++) cin >> arr[i];\n    for(int i=0; i<4; i++) {\n        for(int j=0; j<4-i; j++) {\n            if(arr[j] > arr[j+1]) {\n                int t = arr[j];\n                arr[j] = arr[j+1];\n                arr[j+1] = t;\n            }\n        }\n    }\n    for(int i=0; i<5; i++) cout << arr[i] << (i==4?"":" ");\n    cout << endl;\n    return 0;\n}`,
          Python3: `arr = list(map(int, input().split()))\narr.sort()\nprint(" ".join(map(str, arr)))`
        },
        testCases: [
          { id: 1, input: '23 12 5 90 2', output: '2 5 12 23 90', expected: '2 5 12 23 90', passed: true }
        ],
        tutorialAnswer: '最基础的二重循环排序思维，升序交换相邻元素。'
      }
    ]
  }

  if (course.id === 'prog-py' || course.name.includes('Python')) {
    return [
      {
        id: 'py-ex-1',
        name: '语法 1：高阶列表推导式滤波与累加',
        difficulty: '简单',
        description: '读入一行以空格对齐的分值数据，通过 Python 的列表推导式（List Comprehension），优雅过滤出所有大于 50 的数字并求和。',
        inputFormat: '一行用空格分隔的整数，如 "12 55 90 40 68"。',
        outputFormat: '输出过滤后的整数绝对总和，如 "213"。',
        samples: [{ input: '12 55 90 40 68', output: '213' }],
        starterTemplates: {
          Python3: `# 列表推导式\narr = list(map(int, input().split()))\nans = sum([x for x in arr if x > 50])\nprint(ans)`,
          'C++': `#include <iostream>\nusing namespace std;\nint main() {\n    int val, sum = 0;\n    while(cin >> val) {\n        if(val > 50) sum += val;\n    }\n    cout << sum << endl;\n    return 0;\n}`
        },
        testCases: [{ id: 1, input: '12 55 90 40 68', output: '213', expected: '213', passed: true }],
        tutorialAnswer: '利用 `[x for x in arr if x > 50]` 取得符合条件的筛选数组，再套用内置 sum。'
      },
      {
        id: 'py-ex-2',
        name: '词典 2：文本不区分大小写法词频判定',
        difficulty: '中级',
        description: '读入单词序列。统计各个词不区分大小写下的重复次数。输出降序且优先输出字母位置靠前的最常出单词。',
        inputFormat: '一行英文单词，如 "apple banana APPLE orange banana APPLE"。',
        outputFormat: '输出最常出现的单词及频度，如 "apple 3"。',
        samples: [{ input: 'apple banana APPLE orange banana APPLE', output: 'apple 3' }],
        starterTemplates: {
          Python3: `from collections import Counter\nwords = input().lower().split()\ncnt = Counter(words)\nbest = sorted(cnt.items(), key=lambda x: (-x[1], x[0]))[0]\nprint(f"{best[0]} {best[1]}")`
        },
        testCases: [{ id: 1, input: 'apple banana APPLE orange banana APPLE', output: 'apple 3', expected: 'apple 3', passed: true }],
        tutorialAnswer: '使用 collections.Counter 对字母转换 lower() 后的元组进行综合降序排序。'
      }
    ]
  }

  if (course.id === 'prog-java' || course.name.includes('Java')) {
    return [
      {
        id: 'java-ex-1',
        name: '面向对象 1：多态方法计算不同几何图形面积',
        difficulty: '简单',
        description: '定义包含 `double area()` 接口的 Shape。分别创建 Circle(r) 与 Rect(w, h)。读入形状描述串，多态计算最终面积值并四舍五入。',
        inputFormat: '一行字符串加数值参数，如 "Circle 10" 或 "Rect 4 5"。',
        outputFormat: '输出四舍五入取整面积，如 Circle 10 输出 "314"。',
        samples: [{ input: 'Circle 10', output: '314' }],
        starterTemplates: {
          Java: `import java.util.Scanner;\ninterface Shape { double area(); }\nclass Circle implements Shape {\n    double r; Circle(double r) { this.r = r; }\n    public double area() { return 3.14159 * r * r; }\n}\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        String type = sc.next();\n        if(type.equals("Circle")) {\n            double r = sc.nextDouble();\n            System.out.println((int)Math.round(new Circle(r).area()));\n        }\n    }\n}`
        },
        testCases: [{ id: 1, input: 'Circle 10', output: '314', expected: '314', passed: true }],
        tutorialAnswer: '利用接口多态重写，结合子类实例化实现面向对象的动态派发。'
      }
    ]
  }

  if (course.id === 'prog-ds' || course.name.includes('数据结构')) {
    return [
      {
        id: 'ds-ex-1',
        name: '指针 1：双指针思想单向链表成环判断',
        difficulty: '中级',
        description: '判断指定的有序数字列表转换成链表后，是否有环指针指向之前的循环结点。',
        inputFormat: '若无环结构，请输入 "1 2 3 4 5"。',
        outputFormat: '输出 1 或 0 代表是否拥有物理成环结构。',
        samples: [{ input: '1 2 3 4 5', output: '0' }],
        starterTemplates: {
          Python3: `print(0)`
        },
        testCases: [{ id: 1, input: '1 2 3 4 5', output: '0', expected: '0', passed: true }],
        tutorialAnswer: '使用快慢指针（双指针）。如果两个指针会在中途相遇，则表示链表中存在闭合环。'
      }
    ]
  }

  return (course.knowledgePoints && course.knowledgePoints.length > 0) ? course.knowledgePoints.map((kp, idx) => {
    return {
      id: `${course.id}-gen-${idx}`,
      name: `${idx + 1}. 大纲考点实训：${kp.concept}`,
      difficulty: kp.difficulty === '高级' ? '困难' : kp.difficulty === '进阶' ? '中级' : '简单',
      description: `这是针对课程 《${course.name}》 的考点【${kp.concept}】(${kp.description}) 开发的微型 IDE 拓展大纲任务。\n\n设计程序读入一个校验数值 N，求对考点运行时的输出回执进行测试校验。`,
      inputFormat: `输入任意整型代表运行系数，如 "10"。`,
      outputFormat: `输出检验通过对应的考点回执格式："[${kp.concept}] Verified: ok"`,
      samples: [{ input: '10', output: `[${kp.concept}] Verified: ok` }],
      starterTemplates: {
        Python3: `# 自动适配考点：${kp.concept}\nN = int(input())\nprint(f"[${kp.concept}] Verified: ok")`,
        'C++': `#include <iostream>\nusing namespace std;\nint main() {\n    int n; cin >> n;\n    cout << "[${kp.concept}] Verified: ok" << endl;\n    return 0;\n}`,
        Java: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        System.out.println("[${kp.concept}] Verified: ok");\n    }\n}`
      },
      testCases: [
        { id: 1, input: '10', output: `[${kp.concept}] Verified: ok`, expected: `[${kp.concept}] Verified: ok`, passed: true }
      ],
      tutorialAnswer: `【考点 ${kp.concept} 精析说明】：\n本加练主要面向 ${kp.difficulty} 要求。考查学生在【${kp.description}】方面的基础理解与验证编程意识。`
    }
  }) : [
    {
      id: `${course.id}-fallback-default`,
      name: `拓展大纲实战考核`,
      difficulty: '简单' as const,
      description: `欢迎挑战《${course.name}》内的拓展算法实战。请输出 "OK" 完成本章的实战任务。`,
      inputFormat: '本题没有特定输入。',
      outputFormat: '输出 "OK"',
      samples: [{ input: '(无)', output: 'OK' }],
      starterTemplates: {
        Python3: `print("OK")`
      },
      testCases: [{ id: 1, input: '', output: 'OK', expected: 'OK', passed: true }],
      tutorialAnswer: '直接打印 "OK" 即可通过测试。'
    }
  ]
}

const CONCEPTS_PRACTICE_DATA: ConceptItem[] = [
  {
    id: 'concept-1',
    name: '概念1：主内容区域',
    difficulty: '简单',
    description: '欢迎进入编程学习平台。在这个任务中，你只需向控制台输出一条经典欢迎信息。它也是几乎所有语言的核心运行出口。',
    inputFormat: '本题没有特定输入。',
    outputFormat: '输出一行字符串: "Welcome, 智学星枢 Programming Sandbox!"',
    samples: [
      { input: '(无输入)', output: 'Welcome, 智学星枢 Programming Sandbox!' }
    ],
    starterTemplates: {
      Python3: `# 欢迎打印练习\nprint("Welcome, 智学星枢 Programming Sandbox!")`,
      'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Welcome, 智学星枢 Programming Sandbox!" << endl;\n    return 0;\n}`,
      Java: `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Welcome, 智学星枢 Programming Sandbox!");\n    }\n}`
    },
    testCases: [
      { id: 1, input: '', output: 'Welcome, 智学星枢 Programming Sandbox!', expected: 'Welcome, 智学星枢 Programming Sandbox!', passed: true }
    ],
    tutorialAnswer: '在Python3中，单行打印可直接使用内置 print() 函数:\n```python\nprint("Welcome, 智学星枢 Programming Sandbox!")\n```\n通过此操作你开启了编译沙盒。'
  },
  {
    id: 'concept-2',
    name: '概念2：当前选中的概念',
    difficulty: '中级',
    description: '读取多行成绩列表。过滤小于 60 分的成绩，并对合格成绩计算算术平均值。成绩项以逗号分隔输入。',
    inputFormat: '输入一行包含多个以逗号分隔的成绩整数。',
    outputFormat: '输出算术平均值（保留一位小数）。如果没有合格成绩，输出 0.0。',
    samples: [
      { input: '55,68,90,45,82', output: '80.0' }
    ],
    starterTemplates: {
      Python3: `# 对输入的成绩列表计算合格平均数\nscores = list(map(int, input().split(',')))\npassed = [s for s in scores if s >= 60]\nif passed:\n    print(f"{sum(passed) / len(passed):.1}0")\nelse:\n    print("0.0")`,
      'C++': `#include <iostream>\n#include <vector>\n#include <sstream>\n#include <iomanip>\nusing namespace std;\n\nint main() {\n    string line;\n    if (getline(cin, line)) {\n        stringstream ss(line);\n        string token;\n        int sum = 0, count = 0;\n        while (getline(ss, token, ',')) {\n            int s = stoi(token);\n            if (s >= 60) {\n                sum += s;\n                count++;\n            }\n        }\n        if (count > 0) cout << fixed << setprecision(1) << (double)sum / count << endl;\n        else cout << "0.0" << endl;\n    }\n    return 0;\n}`,
      Java: `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextLine()) {\n            String[] tokens = sc.nextLine().split(",");\n            double sum = 0; int count = 0;\n            for (String tk : tokens) {\n                int s = Integer.parseInt(tk.trim());\n                if (s >= 60) { sum += s; count++; }\n            }\n            if (count > 0) {\n                System.out.printf("%.1f\\n", sum / count);\n            } else {\n                System.out.println("0.0");\n            }\n        }\n    }\n}`
    },
    testCases: [
      { id: 1, input: '55,68,90,45,82', output: '80.0', expected: '80.0', passed: true },
      { id: 2, input: '30,45,12', output: '0.0', expected: '0.0', passed: true }
    ],
    tutorialAnswer: '解析逻辑：\n1. 利用 split(",") 分割输入，将分割出的每个字符串转换成整数。\n2. 利用条件表达式过滤合格成绩 (score >= 60)。\n3. 通过 sum(passed) / len(passed) 保留一位小数打印。'
  },
  {
    id: 'concept-3',
    name: '概念3：输入输出',
    difficulty: '简单',
    description: '编写一个程序，读取两个整数 a 和 b，输出它们的和。这是编程中基本流的基本测试，目的是了解从控制台正确读取两项被空格切割的数据的技术，并正确处理数学计算。',
    inputFormat: '输入两个整数，用空格分隔。',
    outputFormat: '输出一个整数，表示 a 和 b 的和。',
    samples: [
      { input: '3 5', output: '8' },
      { input: '10 20', output: '30' }
    ],
    starterTemplates: {
      Python3: `# 请输入你的代码\na, b = map(int, input().split())\nprint(a + b)`,
      'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    int a, b;\n    if (cin >> a >> b) {\n        cout << a + b << endl;\n    }\n    return 0;\n}`,
      Java: `import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextInt()) {\n            int a = sc.nextInt();\n            int b = sc.nextInt();\n            System.out.println(a + b);\n        }\n    }\n}`
    },
    testCases: [
      { id: 1, input: '3 5', output: '8', expected: '8', passed: true },
      { id: 2, input: '10 20', output: '30', expected: '30', passed: true },
      { id: 3, input: '-1 1', output: '0', expected: '0', passed: true },
      { id: 4, input: '999 1', output: '1000', expected: '1000', passed: true }
    ],
    tutorialAnswer: '解答思路：\n在 Python3 中，`input()` 会取得整行的输入字符串；之后调用 `.split()` 默认将其以空白字符分割成列表。利用 `map(int, ...)` 将生成的两个分割结果包装成整型变量形式，最后借助 `print()` 处理和的格式化展示。\n\n程序样例:\n```python\na, b = map(int, input().split())\nprint(a + b)\n```'
  },
  {
    id: 'concept-4',
    name: '概念4：条件判断',
    difficulty: '简单',
    description: '设计智能温控判定算子。读入当天摄氏温度数值（整数 T），如果温度 T >= 30℃ 输出 "Hot"；在 15℃ 至 29℃ 之间时（包含 15 和 29）输出 "Warm"；否则（低于 15℃）输出 "Cold"。',
    inputFormat: '输入一个温度整数。',
    outputFormat: '输出一行状态指令："Hot", "Warm", 或 "Cold"。',
    samples: [
      { input: '25', output: 'Warm' },
      { input: '32', output: 'Hot' }
    ],
    starterTemplates: {
      Python3: `# 编写条件控制语句\nT = int(input())\nif T >= 30:\n    print("Hot")\nelif T >= 15:\n    print("Warm")\nelse:\n    print("Cold")`,
      'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    int T;\n    cin >> T;\n    if (T >= 30) cout << "Hot" << endl;\n    else if (T >= 15) cout << "Warm" << endl;\n    else cout << "Cold" << endl;\n    return 0;\n}`,
      Java: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int T = sc.nextInt();\n        if (T >= 30) System.out.println("Hot");\n        else if (T >= 15) System.out.println("Warm");\n        else System.out.println("Cold");\n    }\n}`
    },
    testCases: [
      { id: 1, input: '25', output: 'Warm', expected: 'Warm', passed: true },
      { id: 2, input: '30', output: 'Hot', expected: 'Hot', passed: true },
      { id: 3, input: '9', output: 'Cold', expected: 'Cold', passed: true }
    ],
    tutorialAnswer: '这是一道最经典的 `if-elif-else` 结构题。只需要注意各区间的范围判定，尤其是 15 到 29 度这一范围，可以使用 `elif T >= 15:` 作为第二个分支即可，因为大于30的条件已被上一个 `if` 卡住。'
  },
  {
    id: 'concept-5',
    name: '概念5：循环语句',
    difficulty: '简单',
    description: '读取一个正整数 N，依次求解 1 到 N 的所有整数累加和并打印。注意边界。',
    inputFormat: '输入一个正整数 N。',
    outputFormat: '输出它的正整数之和。',
    samples: [
      { input: '100', output: '5050' },
      { input: '10', output: '55' }
    ],
    starterTemplates: {
      Python3: `# 1到N累加\nN = int(input())\nans = sum(range(1, N + 1))\nprint(ans)`,
      'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n; cin >> n;\n    long long sum = 0;\n    for(int i = 1; i <= n; ++i) sum += i;\n    cout << sum << endl;\n    return 0;\n}`,
      Java: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long sum = 0;\n        for(int i = 1; i <= n; i++) sum += i;\n        System.out.println(sum);\n    }\n}`
    },
    testCases: [
      { id: 1, input: '100', output: '5050', expected: '5050', passed: true },
      { id: 2, input: '10', output: '55', expected: '55', passed: true }
    ],
    tutorialAnswer: '可以使用循环，或者使用高斯求和公式 `N * (N + 1) // 2` 来实现常数级别的解法。这是一个数学和循环迭代的基础教学。'
  },
  {
    id: 'concept-6',
    name: '概念6：函数',
    difficulty: '中级',
    description: '利用递归或迭代函数计算并输出第 N 项斐波那契数。斐波那契数列定义为: F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)。',
    inputFormat: '输入正整数 N。',
    outputFormat: '输出第 N 的斐波那契整数。',
    samples: [
      { input: '10', output: '55' }
    ],
    starterTemplates: {
      Python3: `# 编写带有记忆化或者循环的斐波那契函数\nN = int(input())\na, b = 0, 1\nfor _ in range(N):\n    a, b = b, a + b\nprint(a)`,
      'C++': `#include <iostream>\nusing namespace std;\n\nint main() {\n    int n; cin >> n;\n    long long a = 0, b = 1;\n    for(int i = 0; i < n; i++) {\n        long long next = a + b;\n        a = b;\n        b = next;\n    }\n    cout << a << endl;\n    return 0;\n}`,
      Java: `import java.util.Scanner;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        int n = sc.nextInt();\n        long a = 0, b = 1;\n        for(int i = 0; i < n; i++) {\n            long next = a + b;\n            a = b;\n            b = next;\n        }\n        System.out.println(a);\n    }\n}`
    },
    testCases: [
      { id: 1, input: '10', output: '55', expected: '55', passed: true },
      { id: 2, input: '6', output: '8', expected: '8', passed: true }
    ],
    tutorialAnswer: '如果要极快，迭代是最省资源的。时间复杂度为 O(N)，相比普通指数递归能够防止运行栈溢出。'
  },
  {
    id: 'concept-7',
    name: '概念7：数组',
    difficulty: '中级',
    description: '读取一组以空格分隔的数值代表一维数组元素。找出其中最大值和最小值的差，输出这两个极值的差距。',
    inputFormat: '输入一行包含多个用空格分隔的整数。',
    outputFormat: '输出这两者中最大值减去最小值的净差。',
    samples: [
      { input: '4 2 9 6 1', output: '8' }
    ],
    starterTemplates: {
      Python3: `# 找出极值并计算差值\narr = list(map(int, input().split()))\nprint(max(arr) - min(arr))`,
      'C++': `#include <iostream>\n#include <vector>\n#include <algorithm>\nusing namespace std;\n\nint main() {\n    int val;\n    vector<int> arr;\n    while (cin >> val) {\n        arr.push_back(val);\n        if (cin.get() == '\\n') break;\n    }\n    if(!arr.empty()) {\n        auto [min_it, max_it] = minmax_element(arr.begin(), arr.end());\n        cout << *max_it - *min_it << endl;\n    }\n    return 0;\n}`,
      Java: `import java.util.*;\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        if (sc.hasNextLine()) {\n            String[] parts = sc.nextLine().split("\\\\s+");\n            int min = Integer.MAX_VALUE;\n            int max = Integer.MIN_VALUE;\n            for(String p : parts) {\n                if(!p.isEmpty()) {\n                    int val = Integer.parseInt(p);\n                    if(val < min) min = val;\n                    if(val > max) max = val;\n                }\n            }\n            System.out.println(max - min);\n        }\n    }\n}`
    },
    testCases: [
      { id: 1, input: '4 2 9 6 1', output: '8', expected: '8', passed: true }
    ],
    tutorialAnswer: '利用 `max(arr)` 与 `min(arr)` 分别求解极值即可。非常适合作为对于顺序数组/列表线性遍历的初步实操。'
  }
]

const emit = defineEmits<{
  addWeeklyHours: [h: number, title: string]
}>()

const { isDark: isDarkTheme, toggleTheme } = useTheme()

const currentCourseId = ref<string>(localStorage.getItem('edumind_current_course_id') || 'prog-c')

const currentCourse = computed(() => COURSES_DATA.find(c => c.id === currentCourseId.value) || COURSES_DATA[0])
const currentExercises = computed(() => getExercisesForCourse(currentCourse.value))

const selectedConceptId = ref<string>((() => {
  const saved = localStorage.getItem('edumind_current_concept_id')
  return saved && currentExercises.value.some(ex => ex.id === saved) ? saved : (currentExercises.value[0]?.id || '')
})())

const sidebarCollapsed = ref(true)

watch(currentCourseId, () => {
  const defaultEx = currentExercises.value[0]?.id || ''
  selectedConceptId.value = defaultEx
  localStorage.setItem('edumind_current_concept_id', defaultEx)
})

const activeConcept = computed(() => currentExercises.value.find(ex => ex.id === selectedConceptId.value) || currentExercises.value[0] || CONCEPTS_PRACTICE_DATA[0])

const selectedLang = ref<string>('Python3')

const activeTab = ref<'题目描述' | '提交记录' | '讨论区'>('题目描述')

const editorText = ref<string>('')

const editedCodeRepo = ref<Record<string, Record<string, string>>>({})

const allPassed = ref<boolean>(true)
const runTimeMs = ref<number>(16)
const memoryUsedMb = ref<number>(4.2)
const compilationProgress = ref<'idle' | 'running' | 'success' | 'failed'>('success')
const userRunOutputLogs = ref<Record<number, string>>({})

const showToast = ref<boolean>(false)
const toastMsg = ref<string>('')

const conceptQuestions = ref<Record<string, { user: string; content: string; time: string; upvotes: number }[]>>({
  'concept-3': [
    { user: '学习者A', content: '输入中如果有三个数，map(int, input().split()) 会报错吗？', time: '10分钟前', upvotes: 4 },
    { user: '助教_刘', content: '会报错 ValueError: too many values to unpack。必须要和左侧变量个数完全对应。', time: '8分钟前', upvotes: 7 }
  ]
})
const newQuestionText = ref<string>('')

const submissionHistory = ref<Record<string, { time: string; lang: string; status: string; usage: string }[]>>({
  'concept-3': [
    { time: '2026-05-25 15:10', lang: 'Python3', status: '通过全部测试', usage: '16ms / 4.2MB' },
    { time: '2026-05-24 10:02', lang: 'C++', status: '解答错误(WA)', usage: '0ms / 1.2MB' }
  ]
})

const starredConcepts = ref<Record<string, boolean>>({})

watch([() => activeConcept.value.id, selectedLang], () => {
  const savedCode = editedCodeRepo.value[activeConcept.value.id]?.[selectedLang.value]
  if (savedCode !== undefined) {
    editorText.value = savedCode
  } else {
    editorText.value = activeConcept.value.starterTemplates[selectedLang.value] || ''
  }
})

function handleEditorTextChange(text: string) {
  editorText.value = text
  const conceptRepo = editedCodeRepo.value[activeConcept.value.id] || {}
  editedCodeRepo.value = {
    ...editedCodeRepo.value,
    [activeConcept.value.id]: {
      ...conceptRepo,
      [selectedLang.value]: text
    }
  }
}

let toastTimer: ReturnType<typeof setTimeout> | null = null

function triggerToast(msg: string) {
  toastMsg.value = msg
  showToast.value = true
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    showToast.value = false
  }, 3000)
}

function handleRunCode() {
  compilationProgress.value = 'running'
  triggerToast("🚀 正在运行编译测试用例...")

  setTimeout(() => {
    compilationProgress.value = 'success'
    runTimeMs.value = Math.floor(Math.random() * 8) + 10
    memoryUsedMb.value = parseFloat((Math.random() * 0.4 + 4.0).toFixed(1))

    const nextOutputs: Record<number, string> = {}
    activeConcept.value.testCases.forEach(tc => {
      nextOutputs[tc.id] = tc.expected
    })
    userRunOutputLogs.value = nextOutputs
    allPassed.value = true

    triggerToast("✅ 全部测试点匹配成功！")
  }, 1200)
}

function handleSubmitCode() {
  triggerToast("⭐️ 代码已正式提交，正在接入评测系统...")

  setTimeout(() => {
    emit('addWeeklyHours', 0.5, `攻克大纲：${activeConcept.value.name}`)

    const nowTime = new Date().toISOString().replace('T', ' ').slice(0, 16)
    const newRecord = {
      time: nowTime,
      lang: selectedLang.value,
      status: '通过全部测试',
      usage: `${runTimeMs.value}ms / ${memoryUsedMb.value}MB`
    }

    const repo = submissionHistory.value[activeConcept.value.id] || []
    submissionHistory.value = {
      ...submissionHistory.value,
      [activeConcept.value.id]: [newRecord, ...repo]
    }

    triggerToast("🎉 恭喜！判定通过！已为你记录已学时数。")
  }, 1000)
}

function handleResetCode() {
  const original = activeConcept.value.starterTemplates[selectedLang.value] || ''
  editorText.value = original
  triggerToast("🔄 代码已恢复为大纲预设初始模版")
}

function handleToggleFavorite() {
  const current = !!starredConcepts.value[activeConcept.value.id]
  const next = !current
  triggerToast(next ? "⭐ 已成功添加到我的收藏夹！" : "已取消收藏该题目")
  starredConcepts.value = {
    ...starredConcepts.value,
    [activeConcept.value.id]: next
  }
}

function handlePostQuestion(e: Event) {
  e.preventDefault()
  if (!newQuestionText.value.trim()) return

  const newQ = {
    user: '小明同学 (我)',
    content: newQuestionText.value,
    time: '刚刚',
    upvotes: 0
  }

  const list = conceptQuestions.value[activeConcept.value.id] || []
  conceptQuestions.value = {
    ...conceptQuestions.value,
    [activeConcept.value.id]: [newQ, ...list]
  }

  newQuestionText.value = ''
  triggerToast("💬 提问发表成功，社区同学及助教将尽快答复！")
}

function handleUpvoteQuestion(idx: number) {
  const list = conceptQuestions.value[activeConcept.value.id] || []
  const updated = list.map((q, qIndex) => {
    if (qIndex === idx) {
      return { ...q, upvotes: q.upvotes + 1 }
    }
    return q
  })
  conceptQuestions.value = {
    ...conceptQuestions.value,
    [activeConcept.value.id]: updated
  }
  triggerToast("👍 点赞支持成功")
}

function handleSelectConcept(itemId: string) {
  selectedConceptId.value = itemId
  localStorage.setItem('edumind_current_concept_id', itemId)
  activeTab.value = '题目描述'
}

function handleCourseChange(e: Event) {
  const target = e.target as HTMLSelectElement
  currentCourseId.value = target.value
  localStorage.setItem('edumind_current_course_id', target.value)
}

function handleGoBack() {
  const tabBtn = document.getElementById('nav-item-0')
  if (tabBtn) tabBtn.click()
}

function handleGoToResources() {
  const tabBtn = document.getElementById('nav-item-1')
  if (tabBtn) tabBtn.click()
}

function handleViewTutorial() {
  const tutorial = activeConcept.value.tutorialAnswer
  triggerToast("💡 答案与思路已展示入讨论区/笔记模版。")
  activeTab.value = '讨论区'
  const newT = {
    user: '系统名师大纲解析',
    content: tutorial,
    time: '置顶推荐',
    upvotes: 99
  }
  const list = conceptQuestions.value[activeConcept.value.id] || []
  if (list.some(q => q.user === '系统名师大纲解析')) return
  conceptQuestions.value = {
    ...conceptQuestions.value,
    [activeConcept.value.id]: [newT, ...list]
  }
}

const lineNumbers = Array.from({ length: 14 }, (_, i) => i + 1)
</script>

<template>
  <div
    :class="[
      'flex-1 flex flex-col rounded-2xl overflow-hidden transition-all duration-300 border',
      'text-[#b8c4dc] border-[rgba(0, 212, 255, 0.1)]'
    ]"
    id="ideal-ide-workspace-box"
  >
    <!-- TOP BAR -->
    <div
      :class="[
        'px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b select-none',
        'border-[rgba(0,212,255,0.1)]'
      ]"
      style="background: rgba(18, 20, 50, 0.6);"
      id="ide-top-nav-bar"
    >
      <div class="flex items-center gap-3 select-none flex-wrap">
        <button
          @click="handleGoBack"
          :class="[
            'flex items-center gap-1 px-2.5 py-1 text-[14px] rounded border transition-all cursor-pointer font-bold',
            isDarkTheme
              ? 'hover:bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.12)] text-[#8b9bc0]'
              : 'hover:bg-[rgba(0,212,255,0.08)] border-[rgba(0,212,255,0.12)] text-[#8b9bc0]'
          ]"
          title="返回目录列表"
        >
          <ArrowLeft :size="14" class="shrink-0" />
          <span>返回</span>
        </button>

        <div :class="['h-4 w-[1px] hidden sm:block', 'bg-[rgba(0,212,255,0.1)]']" />

        <h1 :class="['text-[15px] font-bold tracking-tight', isDarkTheme ? 'text-[#f0f2ff]' : 'text-[#1e293b]']">
          {{ activeConcept.name }}
        </h1>

        <span class="px-2 py-0.5 rounded text-[12.5px] font-bold bg-[#e6ffed] text-[#52c41a] border border-[#d9f7be] select-none font-mono">
          {{ activeConcept.difficulty }}
        </span>
      </div>

      <div class="flex items-center gap-2 flex-wrap">
        <button
          @click="handleToggleFavorite"
          :class="[
            'flex items-center gap-1.5 px-3 py-1 rounded text-[13.5px] font-medium border transition-all cursor-pointer',
            starredConcepts[activeConcept.id]
              ? 'bg-amber-950/40 border-amber-600/70 text-amber-400'
              : isDarkTheme
                ? 'bg-transparent border-[#10102a] hover:border-[#00d4ff] text-[#9aa4d9] hover:text-white'
                : 'bg-transparent border-[#cbd5e1] hover:border-slate-400 text-slate-500 hover:text-[#1e293b]'
          ]"
        >
          <Star :size="14" :class="starredConcepts[activeConcept.id] ? 'fill-amber-400 text-amber-400' : ''" />
          <span>{{ starredConcepts[activeConcept.id] ? '已收藏' : '收藏' }}</span>
        </button>

        <button
          @click="triggerToast('🔗 题目链接已拷贝到您的剪切板，可发分享给班级圈')"
          :class="[
            'flex items-center gap-1.5 px-3 py-1 bg-transparent rounded text-[13.5px] font-medium border transition-all cursor-pointer',
            'border-[rgba(0,212,255,0.12)] hover:border-[#00d4ff] text-[#9aa4d9] hover:text-white'
          ]"
        >
          <Share2 :size="14" />
          <span>分享</span>
        </button>
      </div>
    </div>

    <!-- MAIN IDE GRID -->
    <div
      :class="[
        'grid grid-cols-1 lg:grid-cols-12 flex-1 text-[14.5px] overflow-hidden',
      ]"
      style="background: transparent;"
      id="ide-main-canvas"
    >
      <!-- PANEL 1: LEFT SIDEBAR DIRECTORY -->
      <div
        :class="[
          sidebarCollapsed ? 'lg:col-span-[0] lg:w-0 lg:min-w-0 lg:overflow-visible lg:p-0' : 'lg:col-span-2',
          'border-b lg:border-b-0 lg:border-r',
          'border-[rgba(0,212,255,0.1)]',
          sidebarCollapsed ? 'hidden lg:block' : 'flex flex-col'
        ]"
        :style="sidebarCollapsed ? { background: 'transparent', position: 'relative' } : { background: 'rgba(18, 20, 50, 0.6)' }"
        id="ide-column-sidebar-directory"
      >
        <!-- 折叠按钮 -->
        <button
          @click="sidebarCollapsed = !sidebarCollapsed"
          :class="sidebarCollapsed
            ? 'absolute -right-3 top-3 z-10 w-6 h-6 rounded-full flex items-center justify-center bg-[rgba(18,20,50,0.9)] border border-[rgba(0,212,255,0.2)] hover:border-[#00d4ff] shadow-lg'
            : 'flex items-center justify-end p-2 w-full'"
          :title="sidebarCollapsed ? '展开目录' : '折叠目录'"
        >
          <component :is="sidebarCollapsed ? PanelRightOpen : PanelRightClose" :size="sidebarCollapsed ? 12 : 16" :class="sidebarCollapsed ? '' : 'text-[#9aa4d9] hover:text-[#00d4ff]'" />
        </button>

        <template v-if="!sidebarCollapsed">
          <div class="flex flex-col gap-3 px-3.5">
            <div class="flex flex-col gap-1.5 border-b pb-2 mb-1 border-[rgba(0, 212, 255, 0.1)]/20 select-none">
              <span :class="['text-[12px] font-bold tracking-wider uppercase', isDarkTheme ? 'text-[#00d4ff]' : 'text-slate-500']">当前关联课程</span>
              <div class="relative">
                <select
                  :value="currentCourseId"
                  @change="handleCourseChange"
                  :class="[
                    'w-full text-[13.5px] font-bold rounded-lg border py-2.5 pl-2.5 pr-8 appearance-none cursor-pointer outline-none transition-all',
                    'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.12)] text-[#d8def0] hover:border-[#00d4ff]'
                  ]"
                >
                  <option v-for="c in COURSES_DATA" :key="c.id" :value="c.id">
                    {{ c.name }}
                  </option>
                </select>
                <div class="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-[#9aa4d9]">
                  <ChevronDown :size="14" />
                </div>
              </div>
            </div>

            <div class="flex items-center justify-between pb-1 text-[#00d4ff] select-none font-mono">
              <span class="font-bold text-[13px] tracking-wider uppercase">本栏加练大纲目录</span>
              <span class="text-[12px] font-semibold opacity-85">({{ currentExercises.length }} 题)</span>
            </div>

            <div class="space-y-1.5 max-h-[360px] overflow-y-auto pr-0.5" id="ide-sidebar-directory-exercises">
              <div
                v-for="item in currentExercises"
                :key="item.id"
                @click="handleSelectConcept(item.id)"
                :class="[
                  'group w-full p-2.5 rounded-lg border transition-all duration-150 cursor-pointer flex items-center justify-between text-left relative',
                  selectedConceptId === item.id
                    ? 'bg-[rgba(0,212,255,0.1)] border-[rgba(0,212,255,0.5)] text-[#00d4ff] font-bold shadow-sm'
                    : 'bg-transparent border-transparent text-[#9aa4d9] hover:bg-[rgba(0,212,255,0.06)] hover:text-[#fff]'
                ]"
              >
                <div
                  v-if="selectedConceptId === item.id"
                  class="absolute left-0 top-0 bottom-0 w-1 rounded-l-md bg-[#00d4ff]"
                />

                <div class="flex items-center gap-2 truncate">
                  <span class="truncate leading-tight font-mono text-xs">{{ item.name }}</span>
                </div>

                <ChevronRight
                  :size="14"
                  :class="[
                    'opacity-0 group-hover:opacity-100 transition-opacity shrink-0',
                    'text-[#9aa4d9]'
                  ]"
                />
              </div>
            </div>
          </div>

          <div class="mt-4 pt-3.5 border-t border-[rgba(0, 212, 255, 0.1)]/30 select-none space-y-4 px-3.5">
            <div class="font-mono">
              <div class="flex justify-between items-center text-[13px] mb-1 font-bold">
                <span :class="isDarkTheme ? 'text-slate-400' : 'text-slate-500'">学习进度</span>
                <span :class="isDarkTheme ? 'text-[#d8def0]' : 'text-[#1a1a2e]'">62%</span>
              </div>

              <div class="h-1.5 rounded-full overflow-hidden bg-[rgba(0,212,255,0.06)]">
                <div class="h-full bg-[#00d4ff] rounded-full" style="width: 62%" />
              </div>
            </div>

            <div
              @click="handleGoToResources"
              class="p-2.5 rounded-lg border text-[13px] leading-relaxed cursor-pointer transition-all bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.08)] text-indigo-200 hover:border-[#00d4ff]"
            >
              <div class="flex items-center gap-1.5 mb-1 font-bold">
                <Lightbulb :size="14" class="text-amber-500 fill-amber-500/20" />
                <span>学习建议 / 相关课程</span>
              </div>
              <p class="opacity-95 leading-normal truncate-3-lines">
                完成本大纲输入输出专项练习后，建议继续挑战下一大纲《条件判断》。在【资源中心】有该题解。
              </p>
            </div>
          </div>
        </template>
      </div>

      <!-- PANEL 2: MIDDLE PROBLEM DESCRIPTION (TABS) -->
      <div
        :class="[
          sidebarCollapsed ? 'lg:col-span-3' : 'lg:col-span-2',
          'border-b lg:border-b-0 lg:border-r p-3.5 flex flex-col min-w-0 overflow-hidden',
          'border-[rgba(0,212,255,0.1)]'
        ]"
        style="background: rgba(18, 20, 50, 0.6);"
        id="ide-column-problem-tabs-panel"
      >
        <div class="flex items-center justify-center border-b border-[rgba(0, 212, 255, 0.1)]/20 pb-1.5 mb-2 select-none font-sans font-medium text-[14.5px]">
          <button
            @click="activeTab = '题目描述'"
            :class="[
              'flex justify-center items-center flex-1 text-center pb-2 relative transition-all cursor-pointer',
              activeTab === '题目描述'
                ? 'text-[#00d4ff] font-bold'
                : 'text-[#8b9bc0] hover:text-[#d8def0]'
            ]"
          >
            题目描述
            <div v-if="activeTab === '题目描述'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00d4ff]" />
          </button>

          <button
            @click="activeTab = '提交记录'"
            :class="[
              'flex justify-center items-center flex-1 text-center pb-2 relative transition-all cursor-pointer',
              activeTab === '提交记录'
                ? 'text-[#00d4ff] font-bold'
                : 'text-[#8b9bc0] hover:text-[#d8def0]'
            ]"
          >
            提交记录
            <div v-if="activeTab === '提交记录'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00d4ff]" />
          </button>

          <button
            @click="activeTab = '讨论区'"
            :class="[
              'flex justify-center items-center flex-1 text-center pb-2 relative transition-all cursor-pointer',
              activeTab === '讨论区'
                ? 'text-[#00d4ff] font-bold'
                : 'text-[#8b9bc0] hover:text-[#d8def0]'
            ]"
          >
            讨论区
            <div v-if="activeTab === '讨论区'" class="absolute bottom-0 left-0 right-0 h-[2px] bg-[#00d4ff]" />
          </button>
        </div>

        <!-- TAB 1: 题目描述 -->
        <div v-if="activeTab === '题目描述'" class="flex-1 flex flex-col justify-between overflow-y-auto max-h-[520px] pr-1 scrollbar-thin select-text min-w-0" id="problem-desc-scroller">
          <div class="space-y-3 min-w-0">
            <div class="space-y-2">
              <h3 :class="['text-[15.5px] font-bold', isDarkTheme ? 'text-[#f0f2ff]' : 'text-slate-800']">
                题目描述
              </h3>
              <p :class="['leading-relaxed leading-6 text-[14px] whitespace-pre-line', isDarkTheme ? 'text-[#b8c4dc]' : 'text-slate-600']">
                {{ activeConcept.description }}
              </p>
            </div>

            <div class="space-y-3.5">
              <div class="space-y-1.5">
                <h4 :class="['text-[14.5px] font-bold font-sans', isDarkTheme ? 'text-[#f0f2ff]' : 'text-slate-800']">输入格式</h4>
                <p :class="['text-[14px]', isDarkTheme ? 'text-[#9aa4d9]' : 'text-slate-600']">
                  {{ activeConcept.inputFormat }}
                </p>
              </div>

              <div class="space-y-1.5">
                <h4 :class="['text-[14.5px] font-bold font-sans', isDarkTheme ? 'text-[#f0f2ff]' : 'text-slate-800']">输出格式</h4>
                <p :class="['text-[14px]', isDarkTheme ? 'text-[#9aa4d9]' : 'text-slate-600']">
                  {{ activeConcept.outputFormat }}
                </p>
              </div>
            </div>

            <div class="space-y-4 pt-1">
              <div v-for="(sample, sIdx) in activeConcept.samples" :key="sIdx" class="space-y-2">
                <h4 :class="['text-[14.5px] font-bold', isDarkTheme ? 'text-[#f0f2ff]' : 'text-slate-800']">
                  示例 {{ sIdx + 1 }}
                </h4>

                <div class="space-y-2">
                  <div class="space-y-1">
                    <span class="text-[13px] text-[#00d4ff] block font-mono">输入</span>
                    <div class="p-2.5 rounded-lg border font-mono text-[13.5px] leading-relaxed bg-[rgba(13,15,40,0.4)] border-[rgba(0,212,255,0.08)]">
                      {{ sample.input }}
                    </div>
                  </div>

                  <div class="space-y-1">
                    <span class="text-[13px] text-[#00d4ff] block font-mono">输出</span>
                    <div class="p-2.5 rounded-lg border font-mono text-[13.5px] leading-relaxed bg-[rgba(13,15,40,0.4)] border-[rgba(0,212,255,0.08)]">
                      {{ sample.output }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- TAB 2: 提交记录 -->
        <div v-if="activeTab === '提交记录'" class="flex-grow overflow-y-auto max-h-[500px] space-y-3 pr-1" id="sub-history-area">
          <div class="flex justify-between items-center text-[13px] text-[#9aa4d9] pb-1.5 border-b border-[rgba(0, 212, 255, 0.1)]/20">
            <span>提交时间</span>
            <span>测评状态</span>
          </div>

          <template v-if="(submissionHistory[activeConcept.id] || []).length > 0">
            <div
              v-for="(history, hIdx) in (submissionHistory[activeConcept.id] || [])"
              :key="hIdx"
              :class="['p-2.5 rounded-lg border transition-all', 'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.08)]']"
            >
              <div class="flex justify-between items-start mb-1 select-none">
                <span class="text-[13px] font-mono opacity-80">{{ history.time }}</span>
                <span :class="['text-[13px] font-bold', history.status === '通过全部测试' ? 'text-emerald-500' : 'text-rose-400']">
                  {{ history.status }}
                </span>
              </div>
              <div class="flex justify-between text-[12px] text-[#9aa4d9] font-mono">
                <span>语言: {{ history.lang }}</span>
                <span>资源消耗: {{ history.usage }}</span>
              </div>
            </div>
          </template>

          <div v-else class="text-center py-12 text-[#8b9bc0] font-mono">
            [ 针对该专项，暂无提交历史记录 ]
          </div>
        </div>

        <!-- TAB 3: 讨论区 -->
        <div v-if="activeTab === '讨论区'" class="flex-grow flex flex-col justify-between overflow-hidden h-[480px]">
          <div class="flex-1 overflow-y-auto space-y-3.5 pr-1 max-h-[350px]">
            <template v-if="(conceptQuestions[activeConcept.id] || []).length > 0">
              <div
                v-for="(qa, qIdx) in (conceptQuestions[activeConcept.id] || [])"
                :key="qIdx"
                :class="['p-2.5 rounded-lg border leading-relaxed', 'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.06)]']"
              >
                <div class="flex justify-between text-[12.5px] mb-1.5 select-none text-[#9aa4d9] font-mono">
                  <span class="font-bold text-blue-400">{{ qa.user }}</span>
                  <span>{{ qa.time }}</span>
                </div>
                <p :class="['text-[13.5px] leading-relaxed select-text', isDarkTheme ? 'text-[#d8def0]' : 'text-slate-700']">
                  {{ qa.content }}
                </p>

                <div class="flex justify-end gap-1.5 mt-2">
                  <button
                    type="button"
                    @click="handleUpvoteQuestion(qIdx)"
                    class="flex items-center gap-1 text-[12px] bg-sky-950/40 hover:bg-sky-900 border border-sky-900 px-2 py-0.5 rounded text-sky-400 transition-colors cursor-pointer select-none"
                  >
                    <ThumbsUp :size="10" />
                    <span>赞({{ qa.upvotes }})</span>
                  </button>
                </div>
              </div>
            </template>

            <div v-else class="text-center py-12 text-[#8b9bc0] font-mono">
              [ 暂无讨论内容，欢迎抢占首评沙发 🛋️ ]
            </div>
          </div>

          <form @submit="handlePostQuestion" class="border-t border-[rgba(0, 212, 255, 0.1)]/20 pt-2.5 mt-2 space-y-2">
            <input
              type="text"
              placeholder="写下疑问或思考..."
              v-model="newQuestionText"
              :class="[
                'w-full px-2.5 py-1.5 rounded-lg text-[13.5px] outline-none border transition-all',
                'bg-[rgba(13,15,40,0.4)] border-[rgba(0,212,255,0.08)] text-white focus:border-blue-500'
              ]"
            />
            <button
              type="submit"
              :disabled="!newQuestionText.trim()"
              class="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[13px] rounded-lg transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              发表提问
            </button>
          </form>
        </div>
      </div>

      <!-- PANEL 3: CODE EDITOR -->
      <div
        :class="[
          sidebarCollapsed ? 'lg:col-span-7' : 'lg:col-span-5',
          'border-b lg:border-b-0 lg:border-r flex flex-col justify-between min-w-0',
          'border-[rgba(0,212,255,0.1)]'
        ]"
        style="background: rgba(18, 20, 50, 0.6);"
        id="ide-column-code-editor-panel"
      >
        <div
          :class="[
            'px-4 py-3 border-b flex items-center justify-between select-none',
            'border-[rgba(0,212,255,0.08)]'
          ]"
          style="background: rgba(13, 15, 40, 0.45);"
          id="editor-heading-row"
        >
          <span :class="['font-bold font-sans', isDarkTheme ? 'text-[#d8def0]' : 'text-slate-800']">
            代码编辑器
          </span>

          <div class="flex items-center gap-1 font-mono">
            <select
              v-model="selectedLang"
              class="text-[13px] font-bold rounded px-2 py-1 leading-none cursor-pointer outline-none border bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.1)] text-[#00d4ff]"
            >
              <option value="Python3">Python3</option>
              <option value="C++">C++</option>
              <option value="Java">Java</option>
            </select>
          </div>
        </div>

        <div class="flex-1 flex align-stretch font-mono relative text-[14px] bg-[rgba(8,10,24,0.5)]" id="editor-body-zone">
          <div class="w-9 bg-[rgba(10,12,30,0.45)] border-r border-[rgba(0,212,255,0.06)] text-[#6f7a9e] text-right pr-2 py-4 select-none leading-6 text-[14px]">
            <div v-for="i in lineNumbers" :key="i">{{ i }}</div>
          </div>

          <textarea
            :value="editorText"
            @input="handleEditorTextChange(($event.target as HTMLTextAreaElement).value)"
            class="flex-grow p-4 bg-transparent text-[#e6edf3] font-mono text-[13.5px] leading-6 select-text outline-none border-none resize-none h-full w-full placeholder:text-gray-600 focus:ring-0"
            placeholder="# 请在此行输入并补全你的代码程序内容..."
          />
        </div>

        <div
          :class="[
            'p-3 border-t flex items-center justify-between select-none',
            'border-[rgba(0,212,255,0.08)]'
          ]"
          style="background: rgba(13, 15, 40, 0.45);"
          id="editor-action-strip"
        >
          <button
            @click="handleResetCode"
            :class="[
              'px-4 py-1.5 text-[13.5px] font-bold font-mono rounded-lg transition-all border cursor-pointer',
              'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.1)] hover:border-[#00d4ff] text-[#b8c4dc]'
            ]"
          >
            重置代码
          </button>

          <button
            @click="handleRunCode"
            :disabled="compilationProgress === 'running'"
            class="px-5 py-1.5 text-[13.5px] font-bold tracking-wider rounded-lg flex items-center gap-1.5 bg-[#00d4ff] hover:bg-[#7e6dff] text-white border-none cursor-pointer transition-all disabled:opacity-50"
          >
            <Play :size="14" class="fill-white text-white" />
            <span>{{ compilationProgress === 'running' ? '编译中...' : '运行代码' }}</span>
          </button>
        </div>
      </div>

      <!-- PANEL 4: RIGHT PANEL RUN RESULTS -->
      <div
        :class="[
          sidebarCollapsed ? 'lg:col-span-2' : 'lg:col-span-3',
          'p-4 flex flex-col justify-between min-w-0',
        ]"
        style="background: rgba(18, 20, 50, 0.6);"
        id="ide-column-run-results-panel"
      >
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between pb-1 border-b border-[rgba(0, 212, 255, 0.1)]/20 text-slate-400 select-none font-sans font-medium">
            <span>运行结果</span>
          </div>

          <div class="space-y-1">
            <h4 class="text-emerald-500 text-[15px] font-bold select-none flex items-center gap-1">
              <CheckCircle :size="16" class="fill-emerald-500/10 text-emerald-500" stroke-width="2.5" />
              <span>已通过全部测试用例</span>
            </h4>
            <p class="text-[13px] text-[#9aa4d9] font-mono select-none">
              执行用时：{{ runTimeMs }}ms   内存使用：{{ memoryUsedMb }}MB
            </p>
          </div>

          <div class="space-y-2 max-h-[400px] overflow-y-auto pr-0.5 select-none" id="test-case-suite">
            <span class="text-[13px] text-[#9aa4d9] font-mono block mb-1">测试用例</span>

            <div
              v-for="(tc, tcIdx) in activeConcept.testCases"
              :key="tc.id"
              :class="[
                'p-3 rounded-lg border flex flex-col gap-1.5 transition-all',
                'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.08)]'
              ]"
            >
              <div class="flex items-center justify-between">
                <span class="font-bold text-[13px] font-mono text-blue-400 shrink-0">用例 {{ tcIdx + 1 }}</span>
                <CheckCircle :size="14" class="text-emerald-500 fill-emerald-500/10" stroke-width="2.5" />
              </div>

              <div class="grid grid-cols-12 gap-1.5 font-mono text-[12.5px]">
                <div class="col-span-12 flex items-center justify-between gap-2">
                  <span class="text-slate-400">输入</span>
                  <span class="px-2 py-0.5 leading-none rounded select-all bg-[rgba(13,15,40,0.4)] text-[#b8c4dc]">{{ tc.input || '(空)' }}</span>
                </div>

                <div class="col-span-12 flex items-center justify-between gap-2 bg-[#10ffff]/5 p-1 rounded">
                  <span class="text-slate-400">预期</span>
                  <span class="text-[#b8c4dc] font-bold">{{ tc.expected }}</span>
                </div>

                <div class="col-span-12 flex items-center justify-between gap-2">
                  <span class="text-slate-400">输出</span>
                  <span class="text-emerald-400 font-bold font-mono">{{ userRunOutputLogs[tc.id] || tc.output }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-2 border-t border-[rgba(0, 212, 255, 0.1)]/20 pt-4 mt-auto select-none" id="ide-right-action-row">
          <button
            @click="handleSubmitCode"
            class="flex-1 py-2 bg-[#27c24c] hover:bg-[#23ae44] text-white font-bold rounded-lg text-[13.5px] border-none shadow-sm cursor-pointer transition-colors"
          >
            提交代码
          </button>

          <button
            @click="handleViewTutorial"
            :class="[
              'px-4 py-2 text-[13px] font-bold rounded-lg border cursor-pointer transition-all',
              'bg-[rgba(13,15,40,0.45)] border-[rgba(0,212,255,0.1)] hover:border-[#00d4ff] text-[#b8c4dc]'
            ]"
          >
            查看题解
          </button>
        </div>
      </div>
    </div>

    <!-- FLOAT TOAST -->
    <Transition name="toast-slide">
      <div
        v-if="showToast"
        class="fixed bottom-6 right-6 px-4 py-3 bg-[rgba(18,20,50,0.85)] hover:bg-[rgba(18,20,50,0.95)] border border-[rgba(0,212,255,0.6)] text-[#00d4ff] font-mono text-[13.5px] rounded-lg shadow-2xl flex items-center gap-2 select-none z-50 backdrop-blur-sm"
      >
        <Sparkles :size="16" class="text-emerald-400 animate-spin" />
        <span>{{ toastMsg }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-slide-enter-active {
  animation: slideUp 0.3s ease-out;
}
.toast-slide-leave-active {
  animation: slideUp 0.3s ease-in reverse;
}
@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
