import test from 'node:test'
import assert from 'node:assert/strict'
import {toFriendlyError} from './errors.ts'

test('注册 409 解释已注册并引导登录，不能建议等待重试',()=>{
 const error=Object.assign(new Error('Request failed: 409'),{status:409,code:'account-exists'})
 const result=toFriendlyError(error)
 assert.match(result.title,/账号已注册/)
 assert.match(result.detail,/当前密码登录/)
 assert.doesNotMatch(result.detail,/稍后重试|意外状态/)
 assert.equal(result.reauth,false)
})
test('注册字段错误返回具体可修正规则',()=>{
 for(const [code,pattern]of [['invalid-account',/3–64.*@/],['invalid-password',/8–128/],['invalid-display-name',/1–64/]]){
  const result=toFriendlyError(Object.assign(new Error('Request failed: 400'),{code}))
  assert.match(result.detail,pattern)
 }
})
test('非注册冲突不误报账号已存在，登录 401 语义保持',()=>{
 assert.doesNotMatch(toFriendlyError(new Error('Request failed: 409')).title,/账号/)
 assert.equal(toFriendlyError(new Error('Request failed: 401')).reauth,true)
})
