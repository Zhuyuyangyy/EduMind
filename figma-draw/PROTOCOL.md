# Figma 施工协议 · 20 个子 agent 并行（串行 lease + 文件锁）

## 铁律
- 全程 **无头语义动作 + 免焦点按键**：任何命令都**不允许**加 `--headed`（用户的真鼠标/真键盘归属用户，物理光标绝不抢）。
- 每个 agent 只用**自己的** `--agent-id`（见分派 prompt），每条桌面命令都要带 `--session run-1793849257572-7224-0`。
- 目标窗口：Edge 里的 Figma 设计文件，窗口 id 初始为 `w-1968004`（标题 "Untitled – Figma"）。**不要用 `--app msedge.exe`**（多进程歧义），只用 `--window-id`。若报 WINDOW_NOT_FOUND：`list-windows` 找到标题含 "Untitled – Figma" 的新 id 再用。
- PowerShell 里所有 ref 必须加单引号：`'@sxxxx:e1'`。

## 工具
- `$ad = "F:\new\agent-desktop-v1.1.0-x86_64-pc-windows-msvc\agent-desktop.exe"`
- `$s = "run-1793849257572-7224-0"`
- 队列根目录：`D:\ZYY Project\EduMind\figma-draw\`（queue/ 待办、done/ 完成、failed/ 失败、shots/ 截图、logs/ 日志）

## 单个工单流程（拿到 item 后一气呵成，持锁不释放）
item JSON 字段：`id` `name` `png` `x` `y`

1. **持锁**：`New-Item -ItemType Directory -Force -Path <lock>` 会返回已存在的目录——必须用"尝试创建并检测是否真是自己创建的"方式：
   ```powershell
   $lock = "D:\ZYY Project\EduMind\figma-draw\lock"
   $mine = $false
   while (-not $mine) {
       if (-not (Test-Path $lock)) {
           try { New-Item -ItemType Directory -Path $lock -ErrorAction Stop | Out-Null; $mine = $true } catch {}
       }
       if (-not $mine) { Start-Sleep -Milliseconds (Get-Random -Minimum 200 -Maximum 600) }
   }
   ```
2. **取件**：取 `queue\` 下第一个 `*.json`（按名称排序），读出字段；若无文件 → 删除 lock 目录，结束。
3. **贴图**：
   - `& $ad clipboard-set --session $s --agent-id <你的id> --image "<png>"` 
   - `Start-Sleep -Milliseconds 700`
   - `& $ad press --session $s --agent-id <你的id> --window-id <W> ctrl+v`
   - `Start-Sleep -Milliseconds 2200`
4. **定位**（重新 find，ref 每次都会变）：
   - `& $ad find --session $s --agent-id <id> --window-id <W> --role spinbutton --name "X-position"` → 取 `matches[0].ref_id`
   - `& $ad set-value --session $s --agent-id <id> '<xref>' "<x>"` ← **注意：set-value 绝不传 --window-id**（该命令不支持此 flag，传了会 INVALID_ARGS 失败）
   - 同样找 `Y-position` → set-value `<y>`
   - `Start-Sleep -Milliseconds 500`
5. **验收**：`& $ad screenshot --session $s --agent-id <id> --window-id <W> "D:\ZYY Project\EduMind\figma-draw\shots\<name>.png"`
6. **归档**：把 item 文件 move 到 `done\<name>.json`；同时 `Set-Content "D:\ZYY Project\EduMind\figma-draw\logs\<name>.log"` 记录 agent-id、时间、x/y。
7. **释放锁**：`Remove-Item $lock -Force -Recurse`
8. 回到 1 取下一件，直到 queue 空。

## 失败处理
- 若第 4 步找不到 X-position spinbutton（贴图没上岸）：重贴一次（重做 3、4）。两次都失败 → item move 到 `failed\`，写原因到 log，继续下一件。
- 任何一步命令返回 `ok:false` 且 error.code 为 STALE_REF/TIMEOUT：重新 find 拿新 ref 重试该步（最多 3 次）。
- 不要碰画布上已有的其它图片；只操作自己刚贴的（贴图后自动选中）。

## 收尾（所有 agent 完成后由 lead 做）
- `press shift+1`（zoom to fit）+ 全窗口截图存档。
