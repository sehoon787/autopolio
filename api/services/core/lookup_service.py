"""
Lookup Service - Provides autocomplete data for certifications and universities

University data source: https://github.com/Hipo/university-domains-list
"""

import os
import json
from typing import List, Dict, Any, Optional
import yaml


class LookupService:
    """Service for looking up certifications and universities for autocomplete"""

    def __init__(self, config_dir: str = "config"):
        self.config_dir = config_dir
        self._certifications: List[Dict[str, Any]] = []
        self._universities: List[Dict[str, Any]] = []
        self._countries: Dict[str, str] = {}  # alpha_two_code -> country name
        self._loaded_certs = False
        self._loaded_univs = False

    def _load_certifications(self):
        """Load certification data from YAML files"""
        if self._loaded_certs:
            return

        cert_dir = os.path.join(self.config_dir, "certifications")
        if os.path.exists(cert_dir):
            for filename in os.listdir(cert_dir):
                if filename.endswith(".yaml") or filename.endswith(".yml"):
                    filepath = os.path.join(cert_dir, filename)
                    try:
                        with open(filepath, "r", encoding="utf-8") as f:
                            data = yaml.safe_load(f)
                            if data and "certifications" in data:
                                self._certifications.extend(data["certifications"])
                    except Exception as e:
                        print(f"Error loading {filepath}: {e}")

        self._loaded_certs = True

    def _load_universities(self):
        """Load university data from Hipo JSON file"""
        if self._loaded_univs:
            return

        # Load from world_universities.json (Hipo format)
        json_path = os.path.join(
            self.config_dir, "universities", "world_universities.json"
        )
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        self._universities = data
                        # Build country code to name mapping
                        for univ in data:
                            code = univ.get("alpha_two_code", "")
                            country = univ.get("country", "")
                            if code and country and code not in self._countries:
                                self._countries[code] = country
            except Exception as e:
                print(f"Error loading {json_path}: {e}")

        self._loaded_univs = True

    def search_certifications(
        self,
        query: str,
        lang: str = "ko",
        category: Optional[str] = None,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """
        Search certifications by name or issuer

        Args:
            query: Search query string
            lang: Language preference (ko/en)
            category: Optional category filter (it, cloud, security, management, etc.)
            limit: Maximum number of results

        Returns:
            List of matching certifications
        """
        self._load_certifications()

        if not query:
            return []

        query_lower = query.lower()
        results = []

        for cert in self._certifications:
            # Check category filter
            if category and cert.get("category") != category:
                continue

            # Search in name fields
            name = cert.get("name", "")
            name_en = cert.get("name_en", "")
            name_ko = cert.get("name_ko", "")
            issuer = cert.get("issuer", "")

            # Calculate match score
            score = 0
            if query_lower in name.lower():
                score = 100 if name.lower().startswith(query_lower) else 80
            elif query_lower in name_en.lower():
                score = 90 if name_en.lower().startswith(query_lower) else 70
            elif query_lower in name_ko.lower():
                score = 90 if name_ko.lower().startswith(query_lower) else 70
            elif query_lower in issuer.lower():
                score = 50

            if score > 0:
                # Determine display name based on language
                if lang == "ko":
                    display_name = name_ko or name
                else:
                    display_name = name_en or name

                results.append(
                    {
                        "id": cert.get("id", ""),
                        "name": display_name,
                        "name_original": name,
                        "issuer": issuer,
                        "category": cert.get("category", ""),
                        "validity_years": cert.get("validity_years"),
                        "score": score,
                    }
                )

        # Sort by score and limit
        results.sort(key=lambda x: (-x["score"], x["name"]))
        return results[:limit]

    def search_universities(
        self, query: str, country: Optional[str] = None, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search universities by name

        Uses Hipo university-domains-list data format:
        - name: University name
        - country: Full country name
        - alpha_two_code: ISO 3166-1 alpha-2 country code
        - domains: List of email domains
        - web_pages: List of website URLs
        - state-province: State or province (nullable)

        Args:
            query: Search query string
            country: Optional country code filter (ISO alpha-2: KR, US, GB, etc.)
            limit: Maximum number of results

        Returns:
            List of matching universities
        """
        self._load_universities()

        if not query or len(query) < 2:
            return []

        query_lower = query.lower()
        results = []

        for univ in self._universities:
            # Check country filter (by alpha_two_code)
            if country:
                univ_code = univ.get("alpha_two_code", "")
                if univ_code.upper() != country.upper():
                    continue

            # Search in name and state-province
            name = univ.get("name", "")
            state = univ.get("state-province") or ""
            country_name = univ.get("country", "")

            # Calculate match score
            score = 0
            name_lower = name.lower()

            if query_lower in name_lower:
                # Prioritize exact start match
                if name_lower.startswith(query_lower):
                    score = 100
                # Then word-start match
                elif f" {query_lower}" in f" {name_lower}":
                    score = 90
                else:
                    score = 70
            elif state and query_lower in state.lower():
                score = 40
            elif query_lower in country_name.lower():
                score = 30

            if score > 0:
                # Get first domain and web_page
                domains = univ.get("domains", [])
                web_pages = univ.get("web_pages", [])

                results.append(
                    {
                        "name": name,
                        "country": country_name,
                        "country_code": univ.get("alpha_two_code", ""),
                        "state": state,
                        "domain": domains[0] if domains else "",
                        "domains": domains,
                        "web_page": web_pages[0] if web_pages else "",
                        "web_pages": web_pages,
                        "score": score,
                    }
                )

        # Sort by score and name, limit results
        results.sort(key=lambda x: (-x["score"], x["name"]))
        return results[:limit]

    def get_certification_categories(self) -> List[Dict[str, str]]:
        """Get list of available certification categories"""
        self._load_certifications()

        categories = set()
        for cert in self._certifications:
            cat = cert.get("category")
            if cat:
                categories.add(cat)

        # Return with labels
        category_labels = {
            "it": "IT/Software",
            "cloud": "Cloud",
            "security": "Security",
            "networking": "Networking",
            "database": "Database",
            "development": "Development",
            "management": "Project Management",
            "data": "Data Engineering",
            "ai": "AI/ML",
            "language": "Language",
            "engineering": "Engineering",
            "other": "Other",
        }

        return [
            {"value": cat, "label": category_labels.get(cat, cat)}
            for cat in sorted(categories)
        ]

    def get_countries(self) -> List[Dict[str, str]]:
        """Get list of countries with universities"""
        self._load_universities()

        # Return sorted list of country code -> name
        return [
            {"value": code, "label": name}
            for code, name in sorted(self._countries.items(), key=lambda x: x[1])
        ]


# Singleton instance
_lookup_service: Optional[LookupService] = None


def get_lookup_service() -> LookupService:
    """Get or create the lookup service singleton"""
    global _lookup_service
    if _lookup_service is None:
        _lookup_service = LookupService()
    return _lookup_service
