import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { usersApi } from '@/api/users'
import { ArrowRight, Github } from 'lucide-react'

export default function SetupPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { setUser } = useUserStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const createUserMutation = useMutation({
    mutationFn: (data: { name: string; email?: string }) => usersApi.create(data),
    onSuccess: (response) => {
      setUser(response.data)
      toast({
        title: '설정 완료',
        description: '사용자 정보가 저장되었습니다.',
      })
      navigate('/setup/github')
    },
    onError: (error: Error) => {
      toast({
        title: '오류',
        description: error.message || '사용자 생성에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      toast({
        title: '입력 필요',
        description: '이름을 입력해주세요.',
        variant: 'destructive',
      })
      return
    }
    createUserMutation.mutate({
      name: name.trim(),
      email: email.trim() || undefined,
    })
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">초기 설정</h1>
        <p className="text-gray-600">
          Autopolio를 시작하기 전에 기본 정보를 설정해주세요.
        </p>
      </div>

      <div className="space-y-6">
        {/* Step 1: User Info */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary text-white flex items-center justify-center text-sm font-medium">
                1
              </div>
              <div>
                <CardTitle>기본 정보</CardTitle>
                <CardDescription>이력서에 표시될 기본 정보를 입력하세요.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">이름 *</Label>
                <Input
                  id="name"
                  placeholder="홍길동"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="example@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? (
                  '저장 중...'
                ) : (
                  <>
                    다음 단계
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Step 2: GitHub (disabled) */}
        <Card className="opacity-50">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gray-300 text-white flex items-center justify-center text-sm font-medium">
                2
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Github className="h-5 w-5" />
                  GitHub 연동
                </CardTitle>
                <CardDescription>
                  GitHub를 연동하여 레포지토리를 분석하고 프로젝트 정보를 자동으로 가져옵니다.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
