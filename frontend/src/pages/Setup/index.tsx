import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { useAppStore } from '@/stores/appStore'
import { usersApi } from '@/api/users'
import { Wizard, WizardStep, WizardStepContent, useWizard } from '@/components/Wizard'
import { User, Github, CheckCircle2, Sparkles } from 'lucide-react'

// Step 1: User Info Component
function UserInfoStep() {
  const { toast } = useToast()
  const { setUser } = useUserStore()
  const { setCanGoNext, nextStep } = useWizard()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  const createUserMutation = useMutation({
    mutationFn: (data: { name: string; email?: string }) => usersApi.create(data),
    onSuccess: (response) => {
      setUser(response.data)
      toast({
        title: '사용자 정보 저장 완료',
        description: '다음 단계로 진행합니다.',
      })
      nextStep()
    },
    onError: (error: Error) => {
      toast({
        title: '오류',
        description: error.message || '사용자 생성에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  const handleSubmit = () => {
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
    <WizardStepContent>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            기본 정보 입력
          </CardTitle>
          <CardDescription>
            이력서에 표시될 기본 정보를 입력하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">이름 *</Label>
            <Input
              id="name"
              placeholder="홍길동"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setCanGoNext(e.target.value.trim().length > 0)
              }}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">이메일 (선택)</Label>
            <Input
              id="email"
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button
            onClick={handleSubmit}
            className="w-full"
            disabled={createUserMutation.isPending || !name.trim()}
          >
            {createUserMutation.isPending ? '저장 중...' : '정보 저장'}
          </Button>
        </CardContent>
      </Card>
    </WizardStepContent>
  )
}

// Step 2: GitHub Connection Component
function GitHubConnectionStep() {
  const navigate = useNavigate()
  const { toast } = useToast()
  useUserStore() // Keep store connection for potential future use
  useWizard() // Keep wizard context connection
  const { isElectronApp } = useAppStore()
  const [isConnecting, setIsConnecting] = useState(false)

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const { githubApi } = await import('@/api/github')
      const response = await githubApi.connect('/setup/github', isElectronApp)
      if (isElectronApp) {
        // Electron: open OAuth in external browser
        // After OAuth, backend will redirect to autopolio:// protocol
        window.open(response.data.auth_url, '_blank')
        toast({
          title: 'GitHub 인증',
          description: '브라우저에서 GitHub 인증을 완료해주세요.',
        })
        setIsConnecting(false)
      } else {
        // Web: redirect in same window
        window.location.href = response.data.auth_url
      }
    } catch (error) {
      toast({
        title: '오류',
        description: 'GitHub 연동을 시작할 수 없습니다.',
        variant: 'destructive',
      })
      setIsConnecting(false)
    }
  }

  const handleSkip = () => {
    navigate('/dashboard')
  }

  return (
    <WizardStepContent>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            GitHub 연동
          </CardTitle>
          <CardDescription>
            GitHub를 연동하면 레포지토리 분석을 통해 프로젝트 정보를 자동으로 추출할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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
                기술 스택 자동 탐지 (200+ 기술)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                기여도 통계 계산
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handleConnect}
              disabled={isConnecting}
            >
              <Github className="mr-2 h-5 w-5" />
              {isConnecting ? '연동 중...' : 'GitHub로 연동하기'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={handleSkip}
            >
              나중에 하기
            </Button>
          </div>
        </CardContent>
      </Card>
    </WizardStepContent>
  )
}

// Step 3: Completion Component
function CompletionStep() {
  const navigate = useNavigate()

  return (
    <WizardStepContent>
      <Card>
        <CardContent className="py-12 text-center">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
              <Sparkles className="h-8 w-8 text-green-600" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">설정 완료!</h3>
          <p className="text-gray-600 mb-6">
            Autopolio를 사용할 준비가 되었습니다.
            <br />
            이제 프로젝트를 추가하고 이력서를 생성해보세요.
          </p>
          <div className="flex flex-col gap-3 max-w-xs mx-auto">
            <Button onClick={() => navigate('/knowledge/projects')}>
              프로젝트 추가하기
            </Button>
            <Button variant="outline" onClick={() => navigate('/dashboard')}>
              대시보드로 이동
            </Button>
          </div>
        </CardContent>
      </Card>
    </WizardStepContent>
  )
}

export default function SetupPage() {
  const navigate = useNavigate()
  const { user } = useUserStore()

  const steps: WizardStep[] = [
    {
      id: 'user-info',
      title: '기본 정보',
      description: '이력서에 표시될 기본 정보를 입력하세요',
      component: <UserInfoStep />,
    },
    {
      id: 'github',
      title: 'GitHub 연동',
      description: 'GitHub를 연동하여 프로젝트를 자동으로 분석하세요',
      component: <GitHubConnectionStep />,
      canSkip: true,
    },
    {
      id: 'complete',
      title: '완료',
      description: '설정이 완료되었습니다',
      component: <CompletionStep />,
    },
  ]

  const handleComplete = () => {
    navigate('/dashboard')
  }

  const handleCancel = () => {
    navigate('/dashboard')
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">초기 설정</h1>
        <p className="text-gray-600">
          Autopolio를 시작하기 전에 기본 정보를 설정해주세요.
        </p>
      </div>

      <Wizard
        steps={user ? steps.slice(1) : steps}
        onComplete={handleComplete}
        onCancel={handleCancel}
        completeButtonText="시작하기"
        showStepIndicator={true}
        showProgress={true}
      />
    </div>
  )
}
