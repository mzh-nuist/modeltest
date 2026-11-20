# 圣诞树与并发缓存 · 双题 Agent 实测

每个模型收到同字节起始文件，两题各 100 分。用各自的编程 Agent，明确请求 High。记录模型、入口、真实档位和是否取得完整文件。两个分数单独展示，出图和代码分别有可复核证据。

## 前端 · 给圣诞树配一支舞

19 秒原创铃声配乐统一使用 `frontend/music.wav`。`make_music.py` 可重新生成 WAV 和制作时间表。画面在浏览器播放时独立观察，暂停和拖动时取对应时间截图。评分依据如下。

| 维度 | 分数 | 给分依据 |
| --- | ---: | --- |
| 重拍跟随 | 20 | 整体灯光或树形在前、中两段的多个重拍都明显响应，弱拍间的画面与重拍有差别。每段 10。 |
| 旋律跟随 | 15 | 高音铃声能驱动独立的局部灯饰。铃声出现和位置变化各 5，二者与整体重拍能区分再得 5。 |
| 段落变化 | 10 | 提速段有可见变化得 5，尾奏有收束或落点得 5。 |
| 树的造型 | 15 | 轮廓清楚、结构有层次、装饰有组织，各 5。 |
| 色彩和光线 | 15 | 树与背景可分、配色连贯、局部高光形成焦点，各 5。 |
| 构图和细节 | 10 | 主体和背景层次清楚得 5，桌面构图完整且静止时也可欣赏得 5。 |
| 播放体验 | 15 | 键盘播放和暂停、拖动和重播、390px 手机各 5，浏览器自动验收。 |

`inspect_tree.mjs` 自动核对最后一组 15 分并生成截图。前两部分是对照音频与画面的观察评分。保存扣分依据，下载的图像和分数可以复核。

表中的 5、10、15 是各观察项的上限。按可见程度给部分分。节奏映射正确但在实屏上微弱，低于能清楚看出对应关系的作品。树的形状、装饰或背景已经存在但细节简单时，按实际完成度给分。播放体验仍按自动验收逐项给满分或零分。

## 后端 · 并发 LRU 缓存

经典题来源为 [LeetCode LRU Cache](https://leetcode.com/problems/lru-cache/)、[Go singleflight](https://pkg.go.dev/golang.org/x/sync/singleflight) 和 [Redis 过期语义](https://redis.io/docs/latest/commands/expire/)。题面的完整边界以 `backend.md` 为准。各组分数为 20、20、20、15、10、15。评分用可控时钟和手动完成的异步任务制造固定竞态。

```powershell
node --permission --allow-fs-read=datasets/christmas_cache_v1 --allow-fs-read=<答卷目录> datasets/christmas_cache_v1/grade_cache.mjs <答卷目录>
node datasets/christmas_cache_v1/inspect_tree.mjs <答卷目录> <截图目录>
```

前端评分需要 Edge 和 Playwright。`QA_PLAYWRIGHT_MODULE` 可指向已安装的模块入口。
