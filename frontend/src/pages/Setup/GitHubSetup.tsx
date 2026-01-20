import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { githubApi } from '@/api/github'
import { usersApi } from '@/api/users'
import { Github, CheckCircle2, ArrowRight } from 'lucide-react'

export default function GitHubSetup() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const { user, setUser } = useUserStore()

  // Check if redirected from GitHub OAuth
  const userId = searchParams.get('user_id')
  const githubConnected = searchParams.get('github_connected')

  // Fetch updated user info after GitHub OAuth
  useEffect(() => {
    if (userId && githubConnected === 'true') {
      usersApi.getById(parseInt(userId)).then((response) => {
        setUser(response.data)
        toast({
          title: 'GitHub 연동 완료',
          description: 'GitHub 계정이 성공적으로 연동되었습니다.',
        })
      })
    }
  }, [userId, githubConnected, setUser, toast])

  const connectMutation = useMutation({
    mutationFn: () => githubApi.connect('/setup/github'),
    onSuccess: (response) => {
      window.location.href = response.data.auth_url
    },
    onError: (error: Error) => {
      toast({
        title: '오류',
        description: error.message || 'GitHub 연동을 시작할 수 없습니다.',
        variant: 'destructive',
      })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => githubApi.disconnect(user!.id),
    onSuccess: () => {
      if (user) {
        setUser({ ...user, github_username: null, github_avatar_url: null })
      }
      toast({
        title: '연동 해제',
        description: 'GitHub 연동이 해제되었습니다.',
      })
    },
    onError: (error: Error) => {
      toast({
        title: '오류',
        description: error.message || 'GitHub 연동 해제에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  const isConnected = !!user?.github_username

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">GitHub 연동</h1>
        <p className="text-gray-600">
          GitHub를 연동하면 레포지토리 분석을 통해 프로젝트 정보를 자동으로 추출할 수 있습니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            GitHub 계정
          </CardTitle>
          <CardDescription>
            GitHub OAuth를 통해 안전하게 연동됩니다. 레포지토리 읽기 권한만 요청합니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isConnected ? (
            <>
              <div className="flex items-center gap-4 p-4 bg-green-50 rounded-lg">
                <CheckCircle2 className="h-8 w-8 text-green-500" />
                <div className="flex-1">
                  <p className="font-medium text-green-900">연동 완료</p>
                  <p className="text-sm text-green-700">
                    @{user.github_username}으로 연동되었습니다.
                  </p>
                </div>
                {user.github_avatar_url && (
                  <img
                    src={user.github_avatar_url}
                    alt={user.github_username || ''}
                    className="h-12 w-12 rounded-full"
                  />
                )}
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                >
                  연동 해제
                </Button>
                <Button onClick={() => navigate('/knowledge/projects')} className="flex-1">
                  프로젝트 관리로 이동
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-gray-50 rounded-lg space-y-3">
                <h4 className="font-medium">연동 시 제공되는 기능:</h4>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    레포지토리 목록 조회
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    커밋 내역 분석
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    기술 스택 자동 탐지
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    기여도 통계 계산
                  </li>
                </ul>
              </div>

              <Button
                className="w-full"
                size="lg"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending}
              >
                <Github className="mr-2 h-5 w-5" />
                {connectMutation.isPending ? '연동 중...' : 'GitHub로 연동하기'}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate('/dashboard')}
              >
                나중에 하기
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
