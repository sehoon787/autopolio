import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { useUserStore } from '@/stores/userStore'
import { githubApi, GitHubRepo } from '@/api/github'
import {
  Github,
  Search,
  Star,
  GitFork,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Filter,
  X,
} from 'lucide-react'

export default function RepoSelector() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const { user } = useUserStore()

  // State
  const [selectedRepos, setSelectedRepos] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [languageFilter, setLanguageFilter] = useState<string>('all')

  // Fetch all repos
  const { data: reposData, isLoading, isError, refetch } = useQuery({
    queryKey: ['github-repos', user?.id],
    queryFn: () => githubApi.getRepos(user!.id, true),
    enabled: !!user?.id,
  })

  const repos = reposData?.data?.repos || []
  const totalRepos = reposData?.data?.total || 0

  // Get unique languages for filter
  const languages = useMemo(() => {
    const langSet = new Set<string>()
    repos.forEach((repo) => {
      if (repo.language) langSet.add(repo.language)
    })
    return Array.from(langSet).sort()
  }, [repos])

  // Filtered repos
  const filteredRepos = useMemo(() => {
    return repos.filter((repo) => {
      const matchesSearch = searchQuery === '' ||
        repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        repo.description?.toLowerCase().includes(searchQuery.toLowerCase())

      const matchesLanguage = languageFilter === 'all' || repo.language === languageFilter

      return matchesSearch && matchesLanguage
    })
  }, [repos, searchQuery, languageFilter])

  // Import mutation
  const importMutation = useMutation({
    mutationFn: (repoUrls: string[]) =>
      githubApi.importRepos(user!.id, repoUrls, false),
    onSuccess: (response) => {
      const { imported, failed, results } = response.data

      if (imported > 0) {
        toast({
          title: '가져오기 완료',
          description: `${imported}개의 레포지토리가 프로젝트로 등록되었습니다.${failed > 0 ? ` (${failed}개 실패)` : ''}`,
        })

        // Clear selection
        setSelectedRepos(new Set())

        // Invalidate projects query
        queryClient.invalidateQueries({ queryKey: ['projects'] })
      } else {
        toast({
          title: '가져오기 실패',
          description: results[0]?.message || '레포지토리를 가져올 수 없습니다.',
          variant: 'destructive',
        })
      }
    },
    onError: (error: any) => {
      toast({
        title: '오류',
        description: error?.response?.data?.detail || '레포지토리 가져오기에 실패했습니다.',
        variant: 'destructive',
      })
    },
  })

  // Handlers
  const toggleRepo = (cloneUrl: string) => {
    const newSelected = new Set(selectedRepos)
    if (newSelected.has(cloneUrl)) {
      newSelected.delete(cloneUrl)
    } else {
      newSelected.add(cloneUrl)
    }
    setSelectedRepos(newSelected)
  }

  const toggleAll = () => {
    if (selectedRepos.size === filteredRepos.length) {
      setSelectedRepos(new Set())
    } else {
      setSelectedRepos(new Set(filteredRepos.map((r) => r.clone_url)))
    }
  }

  const handleImport = () => {
    if (selectedRepos.size === 0) {
      toast({
        title: '선택 필요',
        description: '가져올 레포지토리를 선택해주세요.',
        variant: 'destructive',
      })
      return
    }
    importMutation.mutate(Array.from(selectedRepos))
  }

  const clearFilters = () => {
    setSearchQuery('')
    setLanguageFilter('all')
  }

  if (!user?.github_username) {
    return (
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">GitHub 연동 필요</h2>
            <p className="text-gray-600 mb-4">
              레포지토리를 가져오려면 먼저 GitHub를 연동해주세요.
            </p>
            <Button onClick={() => navigate('/setup/github')}>
              <Github className="mr-2 h-4 w-4" />
              GitHub 연동하기
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GitHub 레포지토리</h1>
          <p className="text-gray-600">
            프로젝트로 가져올 레포지토리를 선택하세요
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button
            onClick={handleImport}
            disabled={selectedRepos.size === 0 || importMutation.isPending}
          >
            <Download className="mr-2 h-4 w-4" />
            {importMutation.isPending
              ? '가져오는 중...'
              : `선택한 레포 가져오기 (${selectedRepos.size})`
            }
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="레포지토리 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={languageFilter} onValueChange={setLanguageFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue placeholder="언어 필터" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">모든 언어</SelectItem>
                {languages.map((lang) => (
                  <SelectItem key={lang} value={lang}>
                    {lang}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {(searchQuery || languageFilter !== 'all') && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="mr-1 h-4 w-4" />
                필터 초기화
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div className="flex items-center gap-4">
          <span>전체 {totalRepos}개 중 {filteredRepos.length}개 표시</span>
          {selectedRepos.size > 0 && (
            <Badge variant="secondary">
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {selectedRepos.size}개 선택됨
            </Badge>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={toggleAll}>
          {selectedRepos.size === filteredRepos.length ? '전체 해제' : '전체 선택'}
        </Button>
      </div>

      {/* Repo List */}
      {isLoading ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
            <p className="text-gray-500">레포지토리 목록을 불러오는 중...</p>
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-red-500 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">레포지토리 목록을 불러올 수 없습니다.</p>
            <Button variant="outline" onClick={() => refetch()}>
              다시 시도
            </Button>
          </CardContent>
        </Card>
      ) : filteredRepos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Github className="h-8 w-8 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {repos.length === 0
                ? '레포지토리가 없습니다.'
                : '검색 조건에 맞는 레포지토리가 없습니다.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredRepos.map((repo) => (
            <RepoCard
              key={repo.id}
              repo={repo}
              selected={selectedRepos.has(repo.clone_url)}
              onToggle={() => toggleRepo(repo.clone_url)}
            />
          ))}
        </div>
      )}

      {/* Action Footer */}
      {selectedRepos.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Card className="shadow-lg border-2">
            <CardContent className="py-3 px-6 flex items-center gap-4">
              <span className="text-sm font-medium">
                {selectedRepos.size}개 레포지토리 선택됨
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedRepos(new Set())}
              >
                선택 취소
              </Button>
              <Button
                size="sm"
                onClick={handleImport}
                disabled={importMutation.isPending}
              >
                <Download className="mr-2 h-4 w-4" />
                프로젝트로 가져오기
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}

// Repo Card Component
interface RepoCardProps {
  repo: GitHubRepo
  selected: boolean
  onToggle: () => void
}

function RepoCard({ repo, selected, onToggle }: RepoCardProps) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-gray-50 ${
        selected ? 'ring-2 ring-primary bg-primary/5' : ''
      }`}
      onClick={onToggle}
    >
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <Checkbox
            checked={selected}
            onCheckedChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="mt-1"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold truncate">{repo.name}</h3>
              {repo.language && (
                <Badge variant="outline" className="text-xs">
                  {repo.language}
                </Badge>
              )}
            </div>

            {repo.description && (
              <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                {repo.description}
              </p>
            )}

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Star className="h-3 w-3" />
                {repo.stargazers_count}
              </span>
              <span className="flex items-center gap-1">
                <GitFork className="h-3 w-3" />
                {repo.forks_count}
              </span>
              <span>
                업데이트: {formatDate(repo.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
