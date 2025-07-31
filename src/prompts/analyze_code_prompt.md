---
platform: { { yamlPlatform } }
problem_id: { { yamlProblemId } }
title: { { yamlTitle } }
language: { { language } }
analyzed_at: { { analyzedAt } }
---

You are an expert software engineer and a coding test specialist. You are also a helpful AI assistant.
Analyze the following {{language}} code from the perspective of a coding test problem solution.
Provide a comprehensive analysis note in **Korean Markdown format** based on the following instructions.
Ensure the analysis is **evidence-based** and backed by **professional reasoning**.

{{mainHeading}}

{{initialSentence}}

### 1. 전체 분석 및 접근 방식 (Overall Analysis & Approach)

- Briefly describe the overall purpose and main functionalities of the provided code.
- Provide a concise overview of the general algorithm or core approach used by the code to solve the problem.

### 2. 코드 구조 및 가독성 (Code Structure & Readability)

- Evaluate the code's organization (e.g., function separation, variable naming conventions, comment usage) and overall readability.
- **Identify any potential code smells or common antipatterns** (e.g., magic numbers, code duplication, overly long functions, etc.), and **propose specific improvements** for them.
- Suggest **concrete ways to enhance the code's readability**.

### 3. 시간 복잡도 분석 (Time Complexity Analysis)

- **Clearly state the time complexity of the main logic using Big O notation.**
- **Explain the derivation process in detail, citing specific evidence** such as loop iterations, nested structures, and the complexity of operations on used data structures.

### 4. 공간 복잡도 분석 (Space Complexity Analysis)

- **Clearly state the space complexity of the main logic using Big O notation.**
- **Explain the derivation process in detail, citing specific evidence** such as variables, data structures (arrays, lists, maps, etc.) that consume memory.

### 5. 잠재적 문제점 및 버그 (Potential Issues & Bugs)

- Point out any **potential bugs, unhandled edge cases, or common mistakes** in the code.
- Provide **specific scenarios** for each identified issue.
- **If any part of the analysis is based on assumptions or is uncertain, clearly state those assumptions and explain why.**

### 6. 개선 제안 (Suggestions for Improvement)

- Propose **concrete methods to optimize performance, improve code clarity, or handle more cases.**
- **Specifically explain how your proposed optimizations impact specific performance metrics like time or memory.**
- **Suggest improvements by applying idiomatic {{language}} code or best practices for the {{language}} language, providing concrete code examples where applicable.**
- **Include simple test cases or scenarios that can verify the suggested improvements.**

### 7. 대안적 접근 방식 (Alternative Approaches) (선택 사항)

- Briefly mention any **alternative algorithms or data structures** that could be considered for solving this problem. (This section should be generated as needed.)

---

Here is the code to analyze:

```{{language}}
{{code}}
```
