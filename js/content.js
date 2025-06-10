import { round, score } from './score.js';

/**
 * Path to directory containing `_list.json` and all levels
 */
const dir = 'data';

export async function fetchList() {
    const listResult = await fetch(`${dir}/list.json`);
    try {
        const list = await listResult.json();
        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(`${dir}/${path}.json`);
                try {
                    const level = await levelResult.json();
                    return [
                        {
                            ...level,
                            path,
                            records: level.records.sort(
                                (a, b) => b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch {
                    console.error(`Failed to load level #${rank + 1} ${path}.`);
                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(`${dir}/editors.json`);
        const editors = await editorsResults.json();
        return editors;
    } catch {
        return null;
    }
}

export async function fetchLeaderboard() {
    const list = await fetchList();

    const scoreMap = {};
    const errs = [];
    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        // Verification
        const verifier = Object.keys(scoreMap).find(
            (u) =>
                typeof u === 'string' &&
                typeof level.verifier === 'string' &&
                u.toLowerCase() === level.verifier.toLowerCase(),
        ) || level.verifier;
        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };
        const { verified } = scoreMap[verifier];
        verified.push({
            rank: rank + 1,
            level: level.name,
            score: score(rank + 1, 100, level.percentToQualify),
            link: level.verification,
        });

        // Records
        level.records.forEach((record) => {
            // Пропускаем пустые или некорректные записи
            if (
                !record ||
                typeof record.user !== 'string' ||
                typeof record.percent !== 'number' ||
                typeof record.link !== 'string'
            ) {
                return;
            }
            const user = Object.keys(scoreMap).find(
                (u) =>
                    typeof u === 'string' &&
                    typeof record.user === 'string' &&
                    u.toLowerCase() === record.user.toLowerCase(),
            ) || record.user;
            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };
            const { completed, progressed } = scoreMap[user];
            if (record.percent === 100) {
                completed.push({
                    rank: rank + 1,
                    level: level.name,
                    score: score(rank + 1, 100, level.percentToQualify),
                    link: record.link,
                });
                return;
            }

            progressed.push({
                rank: rank + 1,
                level: level.name,
                percent: record.percent,
                score: score(rank + 1, record.percent, level.percentToQualify),
                link: record.link,
            });
        });
    });

    // Wrap in extra Object containing the user and total score
    const res = Object.entries(scoreMap).map(([user, scores]) => {
        // Ensure arrays exist
        const verified = Array.isArray(scores.verified) ? scores.verified : [];
        const completed = Array.isArray(scores.completed) ? scores.completed : [];
        const progressed = Array.isArray(scores.progressed) ? scores.progressed : [];
        // Sum only numeric scores
        const total = [verified, completed, progressed]
            .flat()
            .reduce((prev, cur) => prev + (typeof cur.score === 'number' ? cur.score : 0), 0);

        return {
            user,
            total: round(total),
            verified,
            completed,
            progressed,
        };
    });

    // Sort by total score
    return [res.sort((a, b) => b.total - a.total), errs];
}