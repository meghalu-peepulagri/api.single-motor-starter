export function checkDuplicateMotorTitles(arrayOfMotors) {
    const lowerCasedTitles = arrayOfMotors.map((title) => title.toLowerCase());
    const duplicateIndexes = [];
    for (let i = 0; i < lowerCasedTitles.length; i++) {
        if (lowerCasedTitles.indexOf(lowerCasedTitles[i]) !== i) {
            duplicateIndexes.push(i);
        }
    }
    return duplicateIndexes;
}
