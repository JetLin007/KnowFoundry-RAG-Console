"""技能注册与版本管理（二期工程治理基础）"""
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
import json
import hashlib

@dataclass
class Skill:
    """技能定义"""
    name: str
    version: str
    prompt_template: str
    tool_policy: Dict[str, Any]
    model_routing: str
    created_at: datetime = field(default_factory=datetime.now)
    is_active: bool = True

class SkillRegistry:
    """技能注册中心，支持版本管理和灰度发布"""

    def __init__(self):
        self._skills: Dict[str, Skill] = {}
        self._versions: Dict[str, list] = {}  # skill_name -> [versions]

    def register(self, skill: Skill) -> str:
        """注册新技能或新版本"""
        key = f"{skill.name}:{skill.version}"
        self._skills[key] = skill
        if skill.name not in self._versions:
            self._versions[skill.name] = []
        self._versions[skill.name].append(skill.version)
        # 生成 skill_id
        return hashlib.md5(key.encode()).hexdigest()

    def get_skill(self, name: str, version: Optional[str] = None) -> Optional[Skill]:
        """获取技能，默认返回最新版本"""
        if version:
            return self._skills.get(f"{name}:{version}")
        # 返回最新版本
        versions = self._versions.get(name, [])
        if not versions:
            return None
        latest = sorted(versions)[-1]
        return self._skills.get(f"{name}:{latest}")

    def list_versions(self, name: str) -> list:
        """列出技能的所有版本"""
        return self._versions.get(name, [])

    def set_active(self, name: str, version: str, active: bool = True):
        """设置技能版本状态（灰度控制）"""
        skill = self._skills.get(f"{name}:{version}")
        if skill:
            skill.is_active = active
