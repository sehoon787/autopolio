"""
LLM Prompts - Multilingual prompt templates for LLM services

Used by:
- llm_service.py: For generating project summaries, key tasks, achievements
- content_generator.py: For generating detailed content
"""

from typing import Dict

# Multilingual prompt templates
PROMPTS: Dict[str, Dict[str, str]] = {
    "ko": {
        "system_resume": "당신은 이력서/포트폴리오 작성을 돕는 전문가입니다.",
        "system_project_analysis": "당신은 소프트웨어 개발 프로젝트를 분석하는 기술 전문가입니다.",
        "system_key_tasks": "당신은 이력서/포트폴리오 작성 전문가입니다. 프로젝트의 주요 수행 업무를 구체적이고 기술적으로 작성합니다.",
        "system_implementation": "당신은 소프트웨어 개발 프로젝트 분석 전문가입니다. 프로젝트의 주요 구현 기능을 카테고리별로 정리합니다.",
        "system_achievements": "당신은 개발자 이력서 작성 전문가입니다. 프로젝트 성과를 카테고리별로 정리하고, 정량적 수치를 포함한 Before/After 형식으로 작성합니다.",
        "style_professional": "전문적이고 간결한 어조로 작성하세요.",
        "style_casual": "친근하고 읽기 쉬운 어조로 작성하세요.",
        "style_technical": "기술적인 세부사항을 강조하며 작성하세요.",
        "json_format": "응답은 반드시 JSON 형식으로 작성하세요.",
        "summary_prompt": "다음 프로젝트 정보를 바탕으로 이력서에 적합한 요약을 작성해주세요.",
        "commit_summary_prompt": "다음 커밋 메시지들을 분석하고 프로젝트에서 수행한 주요 작업을 2-3문장으로 요약해주세요.",
        "key_tasks_rules": """**작성 규칙:**
1. 8~12개의 주요 수행 업무를 작성
2. 각 업무는 "[기술/프레임워크] 기반 [구체적 작업]" 형식으로 작성
3. 기술 스택에 있는 기술들을 적극 활용
4. 구체적인 기능 구현, 시스템 설계, 최적화 등을 포함
5. 숫자나 특수문자 없이 순수 텍스트로만 작성""",
        "key_tasks_examples": """**예시:**
- FastAPI 기반 데이터 분석 파이프라인 6단계 구현
- TF-IDF 기반 메뉴 자동 분류 시스템 개발 (scikit-learn)
- PostgreSQL 데이터베이스 설계 및 JPA/Hibernate 최적화
- Docker + Docker Compose 컨테이너화 및 CI/CD 구축""",
        "user_edit_context": "\n\n참고: 사용자가 이전에 작성한 내용입니다. 이를 참고하되, 새로운 분석 결과를 반영하여 개선하세요:\n",
    },
    "en": {
        "system_resume": "You are an expert in writing resumes and portfolios.",
        "system_project_analysis": "You are a technical expert analyzing software development projects.",
        "system_key_tasks": "You are a resume/portfolio writing expert. Write specific and technical descriptions of key tasks performed in the project.",
        "system_implementation": "You are a software development project analysis expert. Organize the main implementation features by category.",
        "system_achievements": "You are a developer resume writing expert. Organize project achievements by category with quantitative metrics in Before/After format.",
        "style_professional": "Write in a professional and concise tone.",
        "style_casual": "Write in a friendly and easy-to-read tone.",
        "style_technical": "Emphasize technical details in your writing.",
        "json_format": "Response must be in JSON format.",
        "summary_prompt": "Based on the following project information, write a summary suitable for a resume.",
        "commit_summary_prompt": "Analyze the following commit messages and summarize the main tasks performed in the project in 2-3 sentences.",
        "key_tasks_rules": """**Writing Rules:**
1. Write 8-12 key tasks
2. Each task should follow the format "[Technology/Framework] based [specific task]"
3. Actively utilize technologies from the tech stack
4. Include specific feature implementations, system design, optimizations, etc.
5. Write in plain text only without numbers or special characters""",
        "key_tasks_examples": """**Examples:**
- Implemented 6-stage data analysis pipeline using FastAPI
- Developed automatic menu classification system using TF-IDF (scikit-learn)
- Designed PostgreSQL database and optimized JPA/Hibernate queries
- Containerized with Docker + Docker Compose and set up CI/CD""",
        "user_edit_context": "\n\nNote: This is what the user previously wrote. Reference this but improve with new analysis:\n",
    },
}


def get_prompts(language: str = "ko") -> Dict[str, str]:
    """Get prompts for the specified language, defaulting to Korean.

    Args:
        language: Language code ('ko' for Korean, 'en' for English)

    Returns:
        Dictionary of prompt templates for the specified language
    """
    return PROMPTS.get(language, PROMPTS["ko"])


def get_system_prompt(prompt_key: str, language: str = "ko") -> str:
    """Get a specific system prompt.

    Args:
        prompt_key: Key of the prompt (e.g., 'system_resume', 'system_key_tasks')
        language: Language code

    Returns:
        The prompt string, or empty string if not found
    """
    prompts = get_prompts(language)
    return prompts.get(prompt_key, "")


def get_style_prompt(style: str, language: str = "ko") -> str:
    """Get style-specific prompt.

    Args:
        style: Style name ('professional', 'casual', 'technical')
        language: Language code

    Returns:
        The style prompt string
    """
    prompts = get_prompts(language)
    style_key = f"style_{style}"
    return prompts.get(style_key, prompts.get("style_professional", ""))
