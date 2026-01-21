import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScrollToTopProps {
  threshold?: number
  className?: string
}

export function ScrollToTop({ threshold = 300, className }: ScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      if (window.scrollY > threshold) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [threshold])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (!isVisible) return null

  return (
    <Button
      onClick={scrollToTop}
      size="icon"
      className={cn(
        'fixed bottom-6 right-6 z-50 rounded-full shadow-lg transition-all duration-300',
        'hover:scale-110 hover:shadow-xl',
        'bg-primary text-primary-foreground',
        className
      )}
      aria-label="맨 위로 이동"
    >
      <ArrowUp className="h-5 w-5" />
    </Button>
  )
}
