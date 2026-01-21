import { useState, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/lib/utils'
import { githubApi, FileTreeItem } from '@/api/github'
import { useUserStore } from '@/stores/userStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  Search,
  RefreshCw,
  Home,
} from 'lucide-react'

// File type icons mapping
const FILE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  // Code files
  ts: FileCode,
  tsx: FileCode,
  js: FileCode,
  jsx: FileCode,
  py: FileCode,
  java: FileCode,
  kt: FileCode,
  go: FileCode,
  rs: FileCode,
  cpp: FileCode,
  c: FileCode,
  h: FileCode,
  cs: FileCode,
  php: FileCode,
  rb: FileCode,
  swift: FileCode,
  // Text files
  md: FileText,
  txt: FileText,
  rst: FileText,
  // JSON/Config
  json: FileJson,
  yaml: FileJson,
  yml: FileJson,
  toml: FileJson,
  xml: FileJson,
  // Images
  png: FileImage,
  jpg: FileImage,
  jpeg: FileImage,
  gif: FileImage,
  svg: FileImage,
  webp: FileImage,
}

function getFileIcon(filename: string): React.ComponentType<{ className?: string }> {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return FILE_ICONS[ext] || File
}

// Format file size
function formatSize(bytes: number): string {
  if (bytes === 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Tree node interface
interface TreeNode extends FileTreeItem {
  id: string
  children?: TreeNode[]
  depth: number
  isExpanded?: boolean
}

// Build tree structure from flat file list
function buildTreeFromFlat(files: FileTreeItem[]): TreeNode[] {
  const root: TreeNode[] = []
  const nodeMap = new Map<string, TreeNode>()

  // Sort files - directories first, then by name
  const sortedFiles = [...files].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  for (const file of sortedFiles) {
    const parts = file.path.split('/')
    const node: TreeNode = {
      ...file,
      id: file.path,
      depth: parts.length - 1,
      children: file.type === 'directory' ? [] : undefined,
      isExpanded: false,
    }

    nodeMap.set(file.path, node)

    if (parts.length === 1) {
      root.push(node)
    } else {
      const parentPath = parts.slice(0, -1).join('/')
      const parent = nodeMap.get(parentPath)
      if (parent && parent.children) {
        parent.children.push(node)
      } else {
        // Parent doesn't exist yet, add to root
        root.push(node)
      }
    }
  }

  return root
}

// Flatten tree for rendering (respecting expanded state)
function flattenTree(nodes: TreeNode[], expandedPaths: Set<string>): TreeNode[] {
  const result: TreeNode[] = []

  function traverse(items: TreeNode[], depth: number) {
    for (const item of items) {
      const node = { ...item, depth }
      result.push(node)

      if (item.type === 'directory' && expandedPaths.has(item.path) && item.children) {
        traverse(item.children, depth + 1)
      }
    }
  }

  traverse(nodes, 0)
  return result
}

// Props for FileExplorer
interface FileExplorerProps {
  gitUrl: string
  onFileSelect?: (file: FileTreeItem) => void
  onFileDoubleClick?: (file: FileTreeItem) => void
  className?: string
  height?: number | string
  showSearch?: boolean
  showBreadcrumb?: boolean
  selectable?: boolean
  selectedPaths?: Set<string>
  onSelectionChange?: (paths: Set<string>) => void
}

export function FileExplorer({
  gitUrl,
  onFileSelect,
  onFileDoubleClick,
  className,
  height = 400,
  showSearch = true,
  showBreadcrumb = true,
  selectable = false,
  selectedPaths = new Set(),
  onSelectionChange,
}: FileExplorerProps) {
  const { user } = useUserStore()
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [currentPath, setCurrentPath] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)

  // Fetch file tree recursively
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['github-file-tree', user?.id, gitUrl, currentPath],
    queryFn: () => githubApi.getFileTree(user!.id, gitUrl, { recursive: true }),
    enabled: !!user?.id && !!gitUrl,
    staleTime: 5 * 60 * 1000, // 5 minutes
  })

  const files = data?.data?.files || []

  // Build and flatten tree
  const tree = useMemo(() => buildTreeFromFlat(files), [files])
  const flattenedNodes = useMemo(
    () => flattenTree(tree, expandedPaths),
    [tree, expandedPaths]
  )

  // Filter by search query
  const filteredNodes = useMemo(() => {
    if (!searchQuery.trim()) return flattenedNodes
    const query = searchQuery.toLowerCase()
    return flattenedNodes.filter(
      (node) =>
        node.name.toLowerCase().includes(query) ||
        node.path.toLowerCase().includes(query)
    )
  }, [flattenedNodes, searchQuery])

  // Toggle directory expansion
  const toggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  // Handle item click
  const handleItemClick = useCallback(
    (node: TreeNode) => {
      if (node.type === 'directory') {
        toggleExpand(node.path)
      } else {
        setSelectedFile(node.path)
        if (selectable && onSelectionChange) {
          const newSelection = new Set(selectedPaths)
          if (newSelection.has(node.path)) {
            newSelection.delete(node.path)
          } else {
            newSelection.add(node.path)
          }
          onSelectionChange(newSelection)
        }
        onFileSelect?.(node)
      }
    },
    [toggleExpand, selectable, selectedPaths, onSelectionChange, onFileSelect]
  )

  // Handle double click
  const handleDoubleClick = useCallback(
    (node: TreeNode) => {
      if (node.type === 'file') {
        onFileDoubleClick?.(node)
      }
    },
    [onFileDoubleClick]
  )

  // Render breadcrumb
  const breadcrumbParts = currentPath ? currentPath.split('/') : []

  // Render single tree item
  const renderItem = (node: TreeNode) => {
    const isExpanded = expandedPaths.has(node.path)
    const isSelected = selectedFile === node.path || selectedPaths.has(node.path)
    const FileIcon = node.type === 'directory'
      ? isExpanded
        ? FolderOpen
        : Folder
      : getFileIcon(node.name)

    return (
      <div
        className={cn(
          'flex items-center gap-1 px-2 py-1 cursor-pointer hover:bg-gray-100 rounded text-sm',
          isSelected && 'bg-primary/10 text-primary',
          node.depth > 0 && 'ml-4'
        )}
        style={{ paddingLeft: `${node.depth * 16 + 8}px` }}
        onClick={() => handleItemClick(node)}
        onDoubleClick={() => handleDoubleClick(node)}
      >
        {node.type === 'directory' ? (
          <button
            className="p-0.5 hover:bg-gray-200 rounded"
            onClick={(e) => {
              e.stopPropagation()
              toggleExpand(node.path)
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        <FileIcon
          className={cn(
            'h-4 w-4 shrink-0',
            node.type === 'directory' ? 'text-yellow-500' : 'text-gray-500'
          )}
        />

        <span className="truncate flex-1">{node.name}</span>

        {node.size > 0 && (
          <span className="text-xs text-gray-400 ml-2">
            {formatSize(node.size)}
          </span>
        )}
      </div>
    )
  }

  if (error) {
    return (
      <div className={cn('flex flex-col items-center justify-center p-8', className)}>
        <p className="text-red-500 mb-4">파일 목록을 불러오지 못했습니다.</p>
        <Button variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          다시 시도
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col border rounded-lg', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 p-2 border-b bg-gray-50">
        {showBreadcrumb && (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2"
              onClick={() => setCurrentPath('')}
            >
              <Home className="h-4 w-4" />
            </Button>
            {breadcrumbParts.map((part, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <span className="text-gray-400">/</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-sm"
                  onClick={() =>
                    setCurrentPath(breadcrumbParts.slice(0, idx + 1).join('/'))
                  }
                >
                  {part}
                </Button>
              </div>
            ))}
          </div>
        )}

        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => refetch()}>
          <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
        </Button>
      </div>

      {/* Search */}
      {showSearch && (
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="파일 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8"
            />
          </div>
        </div>
      )}

      {/* File tree */}
      <div style={{ height: typeof height === 'number' ? `${height}px` : height }}>
        {isLoading ? (
          <div className="p-4 space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </div>
        ) : filteredNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {searchQuery ? '검색 결과가 없습니다.' : '파일이 없습니다.'}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="p-1">
              {filteredNodes.map((node) => (
                <div key={node.id}>{renderItem(node)}</div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-3 py-2 border-t bg-gray-50 text-xs text-gray-500">
        {files.length > 0 && (
          <span>
            {files.filter((f) => f.type === 'directory').length}개 폴더,{' '}
            {files.filter((f) => f.type === 'file').length}개 파일
          </span>
        )}
      </div>
    </div>
  )
}

// Compact file explorer for sidebar use
interface CompactFileExplorerProps {
  gitUrl: string
  onFileSelect?: (file: FileTreeItem) => void
  className?: string
}

export function CompactFileExplorer({
  gitUrl,
  onFileSelect,
  className,
}: CompactFileExplorerProps) {
  return (
    <FileExplorer
      gitUrl={gitUrl}
      onFileSelect={onFileSelect}
      className={className}
      height={300}
      showSearch={false}
      showBreadcrumb={false}
    />
  )
}

// File explorer with preview panel
interface FileExplorerWithPreviewProps {
  gitUrl: string
  className?: string
}

export function FileExplorerWithPreview({
  gitUrl,
  className,
}: FileExplorerWithPreviewProps) {
  const { user } = useUserStore()
  const [selectedFile, setSelectedFile] = useState<FileTreeItem | null>(null)

  const { data: fileContent, isLoading: contentLoading } = useQuery({
    queryKey: ['github-file-content', user?.id, gitUrl, selectedFile?.path],
    queryFn: () =>
      githubApi.getFileContent(user!.id, gitUrl, selectedFile!.path),
    enabled: !!user?.id && !!gitUrl && !!selectedFile && selectedFile.type === 'file',
  })

  return (
    <div className={cn('flex gap-4', className)}>
      <div className="w-1/3 min-w-[250px]">
        <FileExplorer
          gitUrl={gitUrl}
          onFileSelect={setSelectedFile}
          height="100%"
        />
      </div>
      <div className="flex-1 border rounded-lg overflow-hidden">
        {selectedFile ? (
          <div className="h-full flex flex-col">
            <div className="px-4 py-2 border-b bg-gray-50 flex items-center gap-2">
              <File className="h-4 w-4" />
              <span className="font-medium text-sm">{selectedFile.name}</span>
              <span className="text-xs text-gray-500">{selectedFile.path}</span>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {contentLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : fileContent?.data?.content ? (
                <pre className="text-xs font-mono whitespace-pre-wrap">
                  {fileContent.data.content}
                </pre>
              ) : (
                <p className="text-gray-500">파일 내용을 불러올 수 없습니다.</p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            파일을 선택하세요
          </div>
        )}
      </div>
    </div>
  )
}
