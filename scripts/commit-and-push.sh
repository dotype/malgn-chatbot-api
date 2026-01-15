# 1) 상태 확인
git status --short

# 2) 변경 전 차이 확인(선택)
git diff

# 3) 모든 변경 스테이징
git add -A

# 4) 커밋 (메시지는 상황에 맞게 변경)
git commit -m "chore: commit changes"

# 5) 현재 브랜치 확인
BRANCH=$(git branch --show-current)
echo "Current branch: $BRANCH"

# 6) 원격이 설정되어 있으면 현재 브랜치로 푸시
git push origin "$BRANCH"

# 만약 원격이 없으면 (예시)
# git remote add origin git@github.com:OWNER/REPO.git
# git push -u origin main

# 만약 인증 토큰으로 푸시해야 하면 (주의: 토큰 노출 주의)
# git push https://<TOKEN>@github.com/OWNER/REPO.git $BRANCH
