export interface VaultDocument { path: string; raw: string; title: string; tags: string[]; headings: string[]; links: string[]; frontmatter: Record<string,string> }
export function normalizeVaultPath(value: string): string | null {
  const parts: string[]=[]
  for(const item of value.replace(/\\/g,'/').split('/')){if(!item||item==='.')continue;if(item==='..'){if(!parts.length)return null;parts.pop()}else parts.push(item)}
  return parts.join('/')
}
export function parseMarkdown(path: string, raw: string): VaultDocument {
  const normalized=normalizeVaultPath(path)
  if(!normalized||normalized.length>160||!/\.(md|mdx|txt)$/i.test(normalized))throw new Error('文件名或格式不受支持（仅 MD、MDX、TXT）。')
  if(raw.length>120000)throw new Error('单份文本最多 120,000 字符，请拆分后导入。')
  const frontmatter:Record<string,string>={},tags:string[]=[],headings:string[]=[],links:string[]=[]
  let body=raw.replace(/^\uFEFF/,'')
  if(body.startsWith('---\n')||body.startsWith('---\r\n')){
    const end=body.indexOf('\n---',4)
    if(end>=0){let listKey='';for(const line of body.slice(body.indexOf('\n')+1,end).split(/\r?\n/)){const match=line.match(/^([\w-]+):\s*(.*)$/);if(match){listKey=match[1]!;frontmatter[listKey]=match[2]!.trim().replace(/^['"]|['"]$/g,'')}else if(listKey&&/^\s*-\s+/.test(line)){frontmatter[listKey]=`${frontmatter[listKey]||''},${line.replace(/^\s*-\s+/,'').trim()}`}}body=body.slice(end+4).replace(/^\r?\n/,'')}
  }
  if(frontmatter.tags)tags.push(...frontmatter.tags.replace(/[\[\]'\"]/g,'').split(/[,，\s]+/).filter(Boolean))
  for(const line of body.split(/\r?\n/)){const heading=line.match(/^#{1,6}\s+(.+)$/);if(heading)headings.push(heading[1]!.replace(/\s+#+$/,''))}
  for(const match of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_/-]+)/gu))tags.push(match[1]!)
  for(const match of body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g))links.push(match[1]!.trim())
  for(const match of body.matchAll(/(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)){const target=match[1]!.split('#')[0]!;if(target&&!/^(?:[a-z]+:|\/)/i.test(target))try{links.push(decodeURIComponent(target))}catch{links.push(target)}}
  return {path:normalized,raw,title:frontmatter.title||headings[0]||normalized.split('/').slice(-1)[0]!.replace(/\.(mdx?|txt)$/i,''),tags:[...new Set(tags)].slice(0,20),headings:headings.slice(0,80),links:[...new Set(links)].slice(0,100),frontmatter}
}
export function resolveVaultLinks(documents: Array<{path:string;links:string[]}>) {
  const edges:Array<{from:string;to:string;kind:'link'}>=[],unresolved:Array<{from:string;target:string}>=[]
  const stem=(value:string)=>value.replace(/\.(mdx?|txt)$/i,'')
  for(const doc of documents)for(const link of doc.links){
    const relative=normalizeVaultPath(`${doc.path.split('/').slice(0,-1).join('/')}/${link}`)
    const exact=documents.find(other=>stem(other.path)===stem(relative||''))||documents.find(other=>stem(other.path)===stem(link))
    const byName=documents.filter(other=>stem(other.path.split('/').slice(-1)[0]!)===stem(link.split('/').slice(-1)[0]!))
    const target=exact||(byName.length===1?byName[0]:null)
    if(target&&target.path!==doc.path){if(!edges.some(e=>e.from===doc.path&&e.to===target.path))edges.push({from:doc.path,to:target.path,kind:'link'})}else if(!target)unresolved.push({from:doc.path,target:link})
  }
  return {edges,unresolved,backlinks:(path:string)=>edges.filter(edge=>edge.to===path).map(edge=>edge.from)}
}
