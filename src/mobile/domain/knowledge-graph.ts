export interface GraphNode { id:string;title:string;kind:'topic'|'note'|'task';state:'unstarted'|'learning'|'review'|'evidence'|'done';description:string;topicId?:string;materialId?:string;taskId?:string;phaseId?:string;tags?:string[];references?:string[] }
export interface GraphEdge { from:string;to:string;label:string }
export const evidenceStates:Record<GraphNode['state'],string>={unstarted:'尚无学习证据',learning:'学习中',review:'有错题待回忆',evidence:'已有练习证据',done:'用户确认完成'}
export function layoutGraph(nodes:GraphNode[]){return nodes.map((node,i)=>({...node,x:90+(i%3)*180+(Math.floor(i/3)%2?25:0),y:80+Math.floor(i/3)*130}))}
