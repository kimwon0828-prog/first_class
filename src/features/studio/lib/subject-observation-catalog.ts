// Reviewed category-level observations. Never reuse a persisted code for a new meaning.
// Review wording: docs/report-all-subject-observations-review.md
export const ADDITIONAL_SUBJECT_OBSERVATION_GROUPS = {
  "korean_language": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "korean_language_asked_about_text",
          "label": "읽은 내용에서 궁금한 점을 물었어요"
        },
        {
          "value": "korean_language_joined_familiar_topic",
          "label": "익숙한 이야기나 주제부터 참여했어요"
        },
        {
          "value": "korean_language_volunteered_thought",
          "label": "자기 생각을 먼저 이야기했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "읽고 표현한 모습",
      "options": [
        {
          "value": "korean_language_found_text_details",
          "label": "글에서 필요한 내용을 찾아냈어요"
        },
        {
          "value": "korean_language_retold_main_content",
          "label": "읽은 내용의 중심 생각을 자기 말로 설명했어요"
        },
        {
          "value": "korean_language_expressed_with_reason",
          "label": "생각과 그 이유를 말이나 글로 표현했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "korean_language_reread_after_question",
          "label": "질문을 들은 뒤 글을 다시 살펴봤어요"
        },
        {
          "value": "korean_language_revised_with_example",
          "label": "예시를 본 뒤 자기 표현을 고쳐 봤어요"
        },
        {
          "value": "korean_language_explained_with_prompt",
          "label": "단서를 받은 뒤 생각을 이어서 설명했어요"
        }
      ]
    }
  ],
  "english": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "english_responded_familiar_expression",
          "label": "익숙한 영어 표현에 반응했어요"
        },
        {
          "value": "english_asked_expression_meaning",
          "label": "궁금한 영어 표현의 뜻을 물었어요"
        },
        {
          "value": "english_tried_new_expression",
          "label": "새로운 영어 표현을 스스로 사용해 봤어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "듣고 읽고 표현한 모습",
      "options": [
        {
          "value": "english_identified_heard_content",
          "label": "들은 내용에 맞는 말이나 행동으로 답했어요"
        },
        {
          "value": "english_found_reading_content",
          "label": "읽은 글에서 필요한 내용을 찾았어요"
        },
        {
          "value": "english_expressed_in_english",
          "label": "배운 표현으로 생각을 말하거나 썼어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "english_retried_after_model",
          "label": "시범을 듣거나 본 뒤 표현을 다시 시도했어요"
        },
        {
          "value": "english_used_expression_in_context",
          "label": "설명을 들은 뒤 다른 상황에 표현을 사용했어요"
        },
        {
          "value": "english_revised_after_feedback",
          "label": "안내를 받은 뒤 말이나 글을 고쳐 봤어요"
        }
      ]
    }
  ],
  "science": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "science_asked_about_phenomenon",
          "label": "관찰한 현상에 대해 질문했어요"
        },
        {
          "value": "science_joined_familiar_phenomenon",
          "label": "익숙한 현상을 다루는 활동부터 참여했어요"
        },
        {
          "value": "science_suggested_investigation",
          "label": "궁금한 점을 확인할 방법을 제안했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "관찰하고 탐구한 모습",
      "options": [
        {
          "value": "science_described_observation",
          "label": "관찰한 특징이나 변화를 말로 설명했어요"
        },
        {
          "value": "science_compared_results",
          "label": "예상한 것과 실제 결과를 비교했어요"
        },
        {
          "value": "science_explained_with_evidence",
          "label": "관찰한 내용을 근거로 현상을 설명했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "science_reobserved_with_prompt",
          "label": "안내받은 부분을 다시 관찰했어요"
        },
        {
          "value": "science_retried_inquiry_steps",
          "label": "설명을 들은 뒤 탐구 과정을 다시 시도했어요"
        },
        {
          "value": "science_revised_explanation",
          "label": "질문을 받은 뒤 설명을 보완했어요"
        }
      ]
    }
  ],
  "social_history": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "social_history_asked_about_topic",
          "label": "오늘 다룬 주제에 대해 질문했어요"
        },
        {
          "value": "social_history_connected_known_event",
          "label": "알고 있던 일과 연결해 이야기에 참여했어요"
        },
        {
          "value": "social_history_shared_viewpoint",
          "label": "자료를 보고 자기 생각을 먼저 이야기했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "자료를 읽고 설명한 모습",
      "options": [
        {
          "value": "social_history_summarized_topic",
          "label": "배운 내용의 핵심을 자기 말로 설명했어요"
        },
        {
          "value": "social_history_found_source_details",
          "label": "자료에서 필요한 정보를 찾아냈어요"
        },
        {
          "value": "social_history_explained_with_source",
          "label": "자료를 근거로 자기 생각을 설명했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "social_history_rechecked_source",
          "label": "질문을 들은 뒤 자료를 다시 확인했어요"
        },
        {
          "value": "social_history_compared_after_example",
          "label": "예시를 본 뒤 공통점이나 차이점을 찾아봤어요"
        },
        {
          "value": "social_history_added_explanation",
          "label": "설명을 들은 뒤 자기 이야기에 내용을 덧붙였어요"
        }
      ]
    }
  ],
  "coding_it_robotics": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "coding_it_robotics_explored_task",
          "label": "제시된 과제를 살펴보며 활동을 시작했어요"
        },
        {
          "value": "coding_it_robotics_asked_about_operation",
          "label": "동작 방식이나 결과에 대해 질문했어요"
        },
        {
          "value": "coding_it_robotics_suggested_implementation",
          "label": "만들어 보고 싶은 기능이나 방법을 제안했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "만들고 수정한 모습",
      "options": [
        {
          "value": "coding_it_robotics_described_task_goal",
          "label": "만들어야 할 결과를 자기 말로 설명했어요"
        },
        {
          "value": "coding_it_robotics_implemented_steps",
          "label": "생각한 순서에 따라 구현을 시도했어요"
        },
        {
          "value": "coding_it_robotics_located_error",
          "label": "예상과 다른 결과가 나온 부분을 찾아봤어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "coding_it_robotics_revised_with_guidance",
          "label": "안내를 받은 뒤 구현한 내용을 수정했어요"
        },
        {
          "value": "coding_it_robotics_retried_smaller_steps",
          "label": "과제를 작은 단계로 나눈 뒤 다시 시도했어요"
        },
        {
          "value": "coding_it_robotics_checked_changed_result",
          "label": "방법을 바꾼 뒤 결과가 달라졌는지 확인했어요"
        }
      ]
    }
  ],
  "foreign_language": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "foreign_language_responded_known_expression",
          "label": "알고 있던 표현에 반응하며 참여했어요"
        },
        {
          "value": "foreign_language_asked_new_expression",
          "label": "처음 접한 표현의 뜻이나 쓰임을 물었어요"
        },
        {
          "value": "foreign_language_initiated_expression",
          "label": "배운 언어로 먼저 말하거나 써 봤어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "이해하고 표현한 모습",
      "options": [
        {
          "value": "foreign_language_showed_content_understanding",
          "label": "듣거나 읽은 내용에 맞게 답했어요"
        },
        {
          "value": "foreign_language_expressed_with_learning",
          "label": "배운 말이나 문장으로 생각을 표현했어요"
        },
        {
          "value": "foreign_language_used_context_expression",
          "label": "주어진 상황에 맞는 표현을 골라 사용했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "foreign_language_retried_after_example",
          "label": "예시를 듣거나 본 뒤 표현을 다시 시도했어요"
        },
        {
          "value": "foreign_language_applied_guided_expression",
          "label": "안내받은 표현을 다른 상황에 활용했어요"
        },
        {
          "value": "foreign_language_revised_expression",
          "label": "설명을 들은 뒤 말이나 글을 고쳐 봤어요"
        }
      ]
    }
  ],
  "art_design": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "art_design_explored_expression",
          "label": "여러 표현 방법을 살펴보며 참여했어요"
        },
        {
          "value": "art_design_started_familiar_method",
          "label": "익숙한 표현 방법부터 시도했어요"
        },
        {
          "value": "art_design_proposed_idea",
          "label": "만들고 싶은 모습이나 아이디어를 제안했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "탐색하고 표현한 모습",
      "options": [
        {
          "value": "art_design_expressed_intention",
          "label": "자기 생각을 작품에 표현했어요"
        },
        {
          "value": "art_design_tried_taught_method",
          "label": "배운 방법을 작품에 사용해 봤어요"
        },
        {
          "value": "art_design_described_choices",
          "label": "표현 방법을 선택한 이유를 이야기했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "art_design_retried_after_demonstration",
          "label": "시범을 본 뒤 표현 방법을 다시 시도했어요"
        },
        {
          "value": "art_design_adjusted_expression",
          "label": "안내를 받은 뒤 작품의 일부를 바꿔 봤어요"
        },
        {
          "value": "art_design_continued_in_steps",
          "label": "과정을 작은 단계로 나눈 뒤 작업을 이어갔어요"
        }
      ]
    }
  ],
  "sports_dance": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "sports_dance_joined_warmup",
          "label": "준비 활동부터 몸을 움직이며 참여했어요"
        },
        {
          "value": "sports_dance_started_familiar_movement",
          "label": "익숙한 동작부터 시도했어요"
        },
        {
          "value": "sports_dance_attempted_new_movement",
          "label": "새로운 동작이나 활동을 스스로 시도했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "움직이고 수행한 모습",
      "options": [
        {
          "value": "sports_dance_followed_movement",
          "label": "제시된 동작을 따라 해 봤어요"
        },
        {
          "value": "sports_dance_connected_movement_sequence",
          "label": "배운 동작을 순서대로 이어갔어요"
        },
        {
          "value": "sports_dance_adjusted_to_rules",
          "label": "활동의 규칙이나 약속에 맞춰 움직였어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "sports_dance_retried_after_model",
          "label": "시범을 본 뒤 같은 동작을 다시 시도했어요"
        },
        {
          "value": "sports_dance_continued_slow_steps",
          "label": "속도를 낮추거나 동작을 나눈 뒤 이어갔어요"
        },
        {
          "value": "sports_dance_adjusted_after_guidance",
          "label": "안내받은 부분을 바꿔 움직여 봤어요"
        }
      ]
    }
  ],
  "creative_mind": [
    {
      "code": "interest_participation",
      "label": "관심과 참여",
      "options": [
        {
          "value": "creative_mind_explored_problem",
          "label": "주어진 문제나 활동을 살펴보며 참여했어요"
        },
        {
          "value": "creative_mind_began_known_method",
          "label": "알고 있던 방법부터 시도했어요"
        },
        {
          "value": "creative_mind_proposed_alternative",
          "label": "다른 방법으로 해 보자고 제안했어요"
        }
      ]
    },
    {
      "code": "performance_today",
      "label": "방법을 찾고 해결한 모습",
      "options": [
        {
          "value": "creative_mind_compared_methods",
          "label": "여러 방법의 결과를 비교했어요"
        },
        {
          "value": "creative_mind_explained_strategy",
          "label": "자기가 선택한 방법을 설명했어요"
        },
        {
          "value": "creative_mind_changed_strategy",
          "label": "막힌 부분에서 방법을 바꿔 시도했어요"
        }
      ]
    },
    {
      "code": "response_to_guidance",
      "label": "안내 후 반응",
      "options": [
        {
          "value": "creative_mind_used_hint",
          "label": "힌트를 들은 뒤 다음 단계를 시도했어요"
        },
        {
          "value": "creative_mind_retried_small_problem",
          "label": "문제를 작은 단계로 나눈 뒤 다시 풀어 봤어요"
        },
        {
          "value": "creative_mind_applied_example_method",
          "label": "예시에서 본 방법을 비슷한 문제에 사용했어요"
        }
      ]
    }
  ]
} as const

export const ADDITIONAL_REPORT_SUBJECT_LABELS = {
  "korean_language": "국어·논술",
  "english": "영어",
  "science": "과학",
  "social_history": "사회·역사",
  "coding_it_robotics": "코딩·IT·로봇",
  "foreign_language": "외국어",
  "art_design": "미술·디자인",
  "sports_dance": "체육·무용",
  "creative_mind": "창의·두뇌"
} as const
