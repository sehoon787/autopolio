"""
LLM Service - Supports both OpenAI and Anthropic for text generation.
"""
from typing import Dict, List, Any, Optional, Tuple
from abc import ABC, abstractmethod
import json

from api.config import get_settings

settings = get_settings()


class BaseLLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> Tuple[str, int]:
        """Generate text. Returns (content, total_tokens)."""
        pass


class OpenAIProvider(BaseLLMProvider):
    """OpenAI GPT provider."""

    def __init__(self, api_key: str, model: str = "gpt-4-turbo-preview"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> Tuple[str, int]:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        response = await client.chat.completions.create(
            model=self.model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature
        )

        content = response.choices[0].message.content
        total_tokens = response.usage.total_tokens if response.usage else 0
        return content, total_tokens


class AnthropicProvider(BaseLLMProvider):
    """Anthropic Claude provider."""

    def __init__(self, api_key: str, model: str = "claude-3-5-sonnet-20241022"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> Tuple[str, int]:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=self.api_key)

        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}]
        }

        if system_prompt:
            kwargs["system"] = system_prompt

        response = await client.messages.create(**kwargs)

        content = response.content[0].text
        total_tokens = (response.usage.input_tokens + response.usage.output_tokens) if response.usage else 0
        return content, total_tokens


class GeminiProvider(BaseLLMProvider):
    """Google Gemini provider using the new google.genai SDK."""

    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self.api_key = api_key
        self.model = model

    async def generate(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        max_tokens: int = 2000,
        temperature: float = 0.7
    ) -> Tuple[str, int]:
        from google import genai

        client = genai.Client(api_key=self.api_key)

        # Build contents with system instruction if provided
        contents = prompt
        config = genai.types.GenerateContentConfig(
            max_output_tokens=max_tokens,
            temperature=temperature,
        )

        # Add system instruction if provided
        if system_prompt:
            config.system_instruction = system_prompt

        response = await client.aio.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

        content = response.text
        total_tokens = 0
        if response.usage_metadata:
            total_tokens = (
                getattr(response.usage_metadata, 'prompt_token_count', 0) +
                getattr(response.usage_metadata, 'candidates_token_count', 0)
            )
        return content, total_tokens


class LLMService:
    """Service for LLM-based text generation."""

    def __init__(self, provider: str = None):
        self.provider_name = provider or settings.llm_provider
        self.provider = self._create_provider()
        self.total_tokens_used = 0

    def _create_provider(self) -> BaseLLMProvider:
        """Create the appropriate LLM provider."""
        if self.provider_name == "openai":
            if not settings.openai_api_key:
                raise ValueError("OpenAI API key not configured")
            return OpenAIProvider(
                settings.openai_api_key,
                settings.openai_model
            )
        elif self.provider_name == "anthropic":
            if not settings.anthropic_api_key:
                raise ValueError("Anthropic API key not configured")
            return AnthropicProvider(
                settings.anthropic_api_key,
                settings.anthropic_model
            )
        elif self.provider_name == "gemini":
            if not settings.gemini_api_key:
                raise ValueError("Gemini API key not configured")
            return GeminiProvider(
                settings.gemini_api_key,
                settings.gemini_model
            )
        else:
            raise ValueError(f"Unknown LLM provider: {self.provider_name}")

    async def generate_project_summary(
        self,
        project_data: Dict[str, Any],
        style: str = "professional"
    ) -> Dict[str, Any]:
        """Generate a summary for a project."""
        style_instructions = {
            "professional": "전문적이고 간결한 어조로 작성하세요.",
            "casual": "친근하고 읽기 쉬운 어조로 작성하세요.",
            "technical": "기술적인 세부사항을 강조하며 작성하세요."
        }

        system_prompt = f"""당신은 이력서/포트폴리오 작성을 돕는 전문가입니다.
{style_instructions.get(style, style_instructions['professional'])}
응답은 반드시 JSON 형식으로 작성하세요."""

        prompt = f"""다음 프로젝트 정보를 바탕으로 이력서에 적합한 요약을 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 팀 규모: {project_data.get('team_size', 'N/A')}명
- 기여도: {project_data.get('contribution_percent', 'N/A')}%
- 기술 스택: {', '.join(project_data.get('technologies', []))}
- 기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

커밋 분석 (있는 경우):
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 커밋 메시지 요약: {project_data.get('commit_summary', 'N/A')}

다음 JSON 형식으로 응답하세요:
{{
    "summary": "2-3문장의 프로젝트 요약",
    "key_features": ["주요 기능 1", "주요 기능 2", "주요 기능 3"],
    "technical_highlights": ["기술적 특징 1", "기술적 특징 2"],
    "role_description": "역할에 대한 상세 설명"
}}"""

        response, tokens = await self.provider.generate(prompt, system_prompt)
        self.total_tokens_used += tokens

        # Parse JSON response
        try:
            # Extract JSON from response (handle markdown code blocks)
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            return json.loads(json_str.strip())
        except json.JSONDecodeError:
            # Return raw response if JSON parsing fails
            return {
                "summary": response,
                "key_features": [],
                "technical_highlights": [],
                "role_description": ""
            }

    async def generate_commit_summary(
        self,
        commit_messages: List[str]
    ) -> str:
        """Generate a summary of commit messages."""
        if not commit_messages:
            return "커밋 내역이 없습니다."

        system_prompt = "당신은 개발 프로젝트의 커밋 내역을 분석하는 전문가입니다."

        prompt = f"""다음 커밋 메시지들을 분석하고 프로젝트에서 수행한 주요 작업을 2-3문장으로 요약해주세요.

커밋 메시지:
{chr(10).join(f'- {msg}' for msg in commit_messages[:30])}

요약:"""

        content, tokens = await self.provider.generate(prompt, system_prompt, max_tokens=500)
        self.total_tokens_used += tokens
        return content

    async def generate_achievement_description(
        self,
        metric_name: str,
        metric_value: str,
        context: str = ""
    ) -> str:
        """Generate a description for an achievement."""
        prompt = f"""다음 성과를 이력서에 적합한 형태로 1-2문장으로 설명해주세요.

성과 지표: {metric_name}
수치: {metric_value}
맥락: {context}

설명:"""

        content, tokens = await self.provider.generate(prompt, max_tokens=200)
        self.total_tokens_used += tokens
        return content

    async def generate_skills_summary(
        self,
        technologies: List[str],
        project_count: int
    ) -> str:
        """Generate a skills summary."""
        prompt = f"""다음 기술 스택을 바탕으로 간단한 기술 요약을 작성해주세요.

사용한 기술:
{', '.join(technologies)}

총 프로젝트 수: {project_count}

기술 요약 (2-3문장):"""

        content, tokens = await self.provider.generate(prompt, max_tokens=300)
        self.total_tokens_used += tokens
        return content

    async def optimize_for_template(
        self,
        content: str,
        max_length: int,
        platform: str
    ) -> str:
        """Optimize content for a specific template/platform."""
        platform_guidelines = {
            "saramin": "사람인 플랫폼에 적합하게 간결하고 전문적으로",
            "wanted": "원티드 플랫폼에 적합하게 성과 중심으로",
            "remember": "리멤버 플랫폼에 적합하게 핵심만 간단히",
            "notion": "노션 포트폴리오에 적합하게 상세하고 시각적으로"
        }

        guideline = platform_guidelines.get(platform, "간결하고 전문적으로")

        prompt = f"""다음 내용을 {guideline} 수정해주세요.
최대 {max_length}자 이내로 작성하세요.

원본:
{content}

수정된 내용:"""

        content, tokens = await self.provider.generate(prompt, max_tokens=max_length // 2)
        self.total_tokens_used += tokens
        return content

    async def generate_key_tasks(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None
    ) -> List[str]:
        """
        Generate key tasks in numbered format (1), (2), (3)...

        Format follows portfolio reference:
        (1) [Framework/Tech] + [Specific Task Description]
        Example: "(1) React + TypeScript 기반 멀티카메라 비디오 어노테이션 UI 개발"
        """
        system_prompt = """당신은 이력서/포트폴리오 작성 전문가입니다.
프로젝트의 주요 수행 업무를 구체적이고 기술적으로 작성합니다.
각 업무는 반드시 사용된 기술/프레임워크와 구체적인 작업 내용을 포함해야 합니다."""

        technologies = project_data.get('technologies', [])
        tech_str = ', '.join(technologies) if technologies else '미지정'

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 수행 업무를 작성해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 기술 스택: {tech_str}
- 기간: {project_data.get('start_date', 'N/A')} ~ {project_data.get('end_date', 'N/A')}

코드 분석 (있는 경우):
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 추가된 라인: {project_data.get('lines_added', 'N/A')}
- 커밋 요약: {commit_summary or 'N/A'}

**작성 규칙:**
1. 8~12개의 주요 수행 업무를 작성
2. 각 업무는 "[기술/프레임워크] 기반 [구체적 작업]" 형식으로 작성
3. 기술 스택에 있는 기술들을 적극 활용
4. 구체적인 기능 구현, 시스템 설계, 최적화 등을 포함
5. 숫자나 특수문자 없이 순수 텍스트로만 작성

**예시:**
- FastAPI 기반 데이터 분석 파이프라인 6단계 구현
- TF-IDF 기반 메뉴 자동 분류 시스템 개발 (scikit-learn)
- PostgreSQL 데이터베이스 설계 및 JPA/Hibernate 최적화
- Docker + Docker Compose 컨테이너화 및 CI/CD 구축
- JWT 토큰 기반 인증 시스템 및 리프레시 토큰 관리
- SSE 스트리밍 기반 실시간 진행 상황 전송 구현

응답 형식:
반드시 JSON 배열 형식으로만 응답하세요. 다른 설명 없이 배열만 반환하세요.
["업무1", "업무2", "업무3", ...]"""

        try:
            response, tokens = await self.provider.generate(
                prompt,
                system_prompt,
                max_tokens=1500,
                temperature=0.3
            )
            self.total_tokens_used += tokens

            # Parse JSON response
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            tasks = json.loads(json_str.strip())

            # Validate and clean
            if isinstance(tasks, list):
                return [str(t).strip() for t in tasks if t and str(t).strip()]
            return []

        except Exception as e:
            return []

    async def generate_implementation_details(
        self,
        project_data: Dict[str, Any],
        commit_summary: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Generate detailed implementation features grouped by category.

        Format follows DETAILED_COMPLETION_REPORT style:
        [
            {
                "title": "멀티뷰 워크스페이스",
                "items": [
                    "1-10개 카메라 동시 시각화",
                    "동기화된 재생 시스템",
                    ...
                ]
            },
            ...
        ]
        """
        system_prompt = """당신은 소프트웨어 개발 프로젝트 분석 전문가입니다.
프로젝트의 주요 구현 기능을 카테고리별로 정리합니다.
각 카테고리는 구체적인 세부 기능들을 포함해야 합니다."""

        technologies = project_data.get('technologies', [])
        tech_str = ', '.join(technologies) if technologies else '미지정'

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 구현 기능을 카테고리별로 정리해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 기술 스택: {tech_str}

코드 분석:
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 커밋 요약: {commit_summary or 'N/A'}

**작성 규칙:**
1. 3~6개의 주요 기능 카테고리를 생성
2. 각 카테고리에는 3~5개의 세부 구현 항목 포함
3. 기술적으로 구체적인 설명 사용
4. 프로젝트 특성에 맞는 카테고리 이름 선정

**예시 형식:**
[
  {{
    "title": "멀티뷰 워크스페이스",
    "items": [
      "1-10개 카메라 동시 시각화 지원",
      "뷰 간 동기화된 재생 시스템",
      "개별 뷰 줌/패닝 컨트롤"
    ]
  }},
  {{
    "title": "어노테이션 시스템",
    "items": [
      "Fabric.js Canvas 기반 그래픽 렌더링",
      "Bounding Box, Polygon, Keypoint 지원",
      "뷰별 독립적 어노테이션 관리"
    ]
  }}
]

응답 형식:
반드시 JSON 배열 형식으로만 응답하세요."""

        try:
            response, tokens = await self.provider.generate(
                prompt,
                system_prompt,
                max_tokens=2000,
                temperature=0.3
            )
            self.total_tokens_used += tokens

            # Parse JSON response
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            details = json.loads(json_str.strip())

            # Validate structure
            if isinstance(details, list):
                validated = []
                for item in details:
                    if isinstance(item, dict) and "title" in item and "items" in item:
                        validated.append({
                            "title": str(item["title"]),
                            "items": [str(i) for i in item.get("items", []) if i]
                        })
                return validated
            return []

        except Exception as e:
            return []

    async def generate_detailed_achievements(
        self,
        project_data: Dict[str, Any],
        existing_achievements: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, List[Dict[str, Any]]]:
        """
        Generate achievements grouped by category with before/after format.

        Format follows PROJECT_PERFORMANCE_SUMMARY style:
        {
            "성능 향상": [
                {
                    "title": "Export 최적화",
                    "description": "Keyframe 전용 export 구현",
                    "before": "전체 프레임 저장",
                    "after": "파일 크기 80% 감소, 속도 3-5배 향상"
                }
            ],
            "기능 확장": [...],
            ...
        }
        """
        system_prompt = """당신은 개발자 이력서 작성 전문가입니다.
프로젝트 성과를 카테고리별로 정리하고, 정량적 수치를 포함한 Before/After 형식으로 작성합니다.
성과는 반드시 측정 가능한 수치(%, 배, 건 등)를 포함해야 합니다."""

        technologies = project_data.get('technologies', [])
        tech_str = ', '.join(technologies) if technologies else '미지정'

        existing_str = ""
        if existing_achievements:
            existing_str = "\n기존에 감지된 성과:\n" + "\n".join(
                f"- {a.get('metric_name', '')}: {a.get('metric_value', '')}"
                for a in existing_achievements
            )

        prompt = f"""다음 프로젝트 정보를 바탕으로 주요 성과를 카테고리별로 정리해주세요.

프로젝트 정보:
- 이름: {project_data.get('name', 'N/A')}
- 설명: {project_data.get('description', 'N/A')}
- 역할: {project_data.get('role', 'N/A')}
- 기술 스택: {tech_str}

코드 통계:
- 총 커밋: {project_data.get('total_commits', 'N/A')}
- 추가된 라인: {project_data.get('lines_added', 'N/A')}
- 삭제된 라인: {project_data.get('lines_deleted', 'N/A')}
{existing_str}

**성과 카테고리:**
- 성능 향상 (Performance): 처리 속도, 응답 시간, 메모리 사용량 개선
- 기능 확장 (Feature): 새로운 기능 추가, 확장성 개선
- 사용자 경험 (UX): UI/UX 개선, 접근성 향상
- 코드 품질 (Quality): 리팩토링, 테스트 커버리지, 모듈화
- 생산성 향상 (Productivity): 자동화, 작업 시간 단축
- 안정성 (Stability): 오류 감소, 가용성 향상

**작성 규칙:**
1. 프로젝트와 관련 있는 카테고리만 포함
2. 각 성과는 반드시 정량적 수치 포함 (%, 배, 건, 초 등)
3. Before/After 형식으로 개선 전후 비교
4. 현실적이고 믿을 수 있는 수치 사용

**예시:**
{{
  "성능 향상": [
    {{
      "title": "Export 최적화",
      "description": "Keyframe 전용 export 구현으로 데이터 정확도 향상",
      "before": "전체 프레임 저장, 대용량 파일 생성",
      "after": "파일 크기 80% 감소, 속도 3-5배 향상"
    }}
  ],
  "기능 확장": [
    {{
      "title": "멀티뷰 동시 라벨링",
      "description": "기존 단일 비디오에서 최대 10개 카메라로 확장",
      "before": "단일 카메라 지원",
      "after": "1-10개 카메라 동시 지원, 다양한 분야 적용 가능"
    }}
  ]
}}

응답 형식:
반드시 JSON 객체 형식으로만 응답하세요."""

        try:
            response, tokens = await self.provider.generate(
                prompt,
                system_prompt,
                max_tokens=2500,
                temperature=0.3
            )
            self.total_tokens_used += tokens

            # Parse JSON response
            json_str = response
            if "```json" in response:
                json_str = response.split("```json")[1].split("```")[0]
            elif "```" in response:
                json_str = response.split("```")[1].split("```")[0]

            achievements = json.loads(json_str.strip())

            # Validate structure
            if isinstance(achievements, dict):
                validated = {}
                for category, items in achievements.items():
                    if isinstance(items, list):
                        validated_items = []
                        for item in items:
                            if isinstance(item, dict) and "title" in item:
                                validated_items.append({
                                    "title": str(item.get("title", "")),
                                    "description": str(item.get("description", "")),
                                    "before": str(item.get("before", "")),
                                    "after": str(item.get("after", ""))
                                })
                        if validated_items:
                            validated[category] = validated_items
                return validated
            return {}

        except Exception as e:
            return {}
