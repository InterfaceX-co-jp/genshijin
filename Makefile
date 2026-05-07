# https://www.client9.com/self-documenting-makefiles/

.DEFAULT_GOAL := help

help: ## ヘルプを表示
	@awk -F ':|##' '/^[^\t].+?:.*?##/ {\
	printf "\033[36m%-30s\033[0m %s\n", $$1, $$NF \
	}' $(MAKEFILE_LIST)

# ---------- バージョン管理 ----------

PLUGIN_JSON := packages/skill-claude/.claude-plugin/plugin.json
VERSION := $(shell python3 -c "import json; print(json.load(open('$(PLUGIN_JSON)'))['version'])")

version: ## 現在のバージョンを表示
	@echo v$(VERSION)

release-dry-patch: ## patch bump をドライラン（1.1.0 → 1.1.1）
	@python3 scripts/bump_version.py patch --dry-run

release-dry-minor: ## minor bump をドライラン（1.1.0 → 1.2.0）
	@python3 scripts/bump_version.py minor --dry-run

release-dry-major: ## major bump をドライラン（1.1.0 → 2.0.0）
	@python3 scripts/bump_version.py major --dry-run

release-patch: _check-clean-tree ## patch bump + CHANGELOG 更新（1.1.0 → 1.1.1）
	@python3 scripts/bump_version.py patch

release-minor: _check-clean-tree ## minor bump + CHANGELOG 更新（1.1.0 → 1.2.0）
	@python3 scripts/bump_version.py minor

release-major: _check-clean-tree ## major bump + CHANGELOG 更新（1.1.0 → 2.0.0）
	@python3 scripts/bump_version.py major

release-commit: ## bump 後に commit + tag を作成（未 push）
	@NEW_VERSION=$$(python3 -c "import json; print(json.load(open('$(PLUGIN_JSON)'))['version'])"); \
	git add $(PLUGIN_JSON) CHANGELOG.md; \
	git commit -m "chore(release): v$$NEW_VERSION"; \
	git tag "v$$NEW_VERSION"; \
	echo ""; \
	echo "✅ commit + tag v$$NEW_VERSION 作成完了"; \
	echo "次: make release-push"

release-push: ## commit と tag を push（リリース workflow 起動）
	@set -e; \
	NEW_VERSION=$$(python3 -c "import json; print(json.load(open('$(PLUGIN_JSON)'))['version'])"); \
	BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if ! git rev-parse -q --verify "refs/tags/v$$NEW_VERSION" >/dev/null; then \
		echo "❌ tag v$$NEW_VERSION が存在しません。先に make release-commit を実行してください。"; \
		exit 1; \
	fi; \
	echo "push 先: origin/$$BRANCH + tag v$$NEW_VERSION"; \
	read -p "続行しますか？ [y/N]: " ans; \
	if [ "$$ans" != "y" ] && [ "$$ans" != "Y" ]; then echo "中止。"; exit 1; fi; \
	git push origin "$$BRANCH"; \
	git push origin "v$$NEW_VERSION"; \
	echo ""; \
	echo "✅ push 完了。GitHub Actions のリリース workflow を確認してください:"; \
	echo "   https://github.com/InterfaceX-co-jp/genshijin/actions"

_check-clean-tree:
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "❌ 作業ツリーに未コミットの変更があります。先にコミット or stash してください。"; \
		git status --short; \
		exit 1; \
	fi
	@BRANCH=$$(git rev-parse --abbrev-ref HEAD); \
	if [ "$$BRANCH" != "main" ]; then \
		echo "⚠️  現在のブランチ: $$BRANCH （main 推奨）"; \
		read -p "このブランチで続行しますか？ [y/N]: " ans; \
		if [ "$$ans" != "y" ] && [ "$$ans" != "Y" ]; then echo "中止。"; exit 1; fi; \
	fi

.PHONY: help version release-dry-patch release-dry-minor release-dry-major \
        release-patch release-minor release-major release-commit release-push \
        _check-clean-tree
